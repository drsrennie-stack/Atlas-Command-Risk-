/* Plays whole matches against a real server over HTTP, the same way browsers do.
   Run:  node test/simulate.js      Exit code 0 means every check passed. */
'use strict';
process.env.TEACHER_CODE = 'testcode'; process.env.PORT = '0';
const http = require('http');
const { server, rooms } = require('../server/server');
const engine = require('../server/engine');
const bank = require('../server/bank');
engine.RULES.chooseSeconds = 2; engine.RULES.revealSeconds = 1;
let base, fails = 0, checks = 0; const banks = {};
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('FAIL: ' + msg); } };
const post = (p, b) => new Promise((res, rej) => { const d = JSON.stringify(b); const r = http.request(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, x => { let s = ''; x.on('data', c => s += c); x.on('end', () => res({ status: x.statusCode, body: JSON.parse(s || '{}') })); }); r.on('error', rej); r.end(d); });
function listen(code, token, onState) {
  const req = http.get(base + '/api/events?code=' + code + '&token=' + token, res => { let buf = ''; res.on('data', c => { buf += c; let i; while ((i = buf.indexOf('\n\n')) >= 0) { const blk = buf.slice(0, i); buf = buf.slice(i + 2); if (blk.startsWith('data: ')) onState(JSON.parse(blk.slice(6))); } }); });
  req.on('error', () => {}); return req;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function playMatch(label, config, nPlayers, skill) {
  const r = await post('/api/room', { teacherCode: 'testcode', config });
  ok(r.status === 200, label + ': room created');
  const bad = await post('/api/room', { teacherCode: 'nope', config }); ok(bad.status === 403, label + ': wrong teacher code refused');
  const code = r.body.code; const room = rooms.get(code);
  let hostState = null; const hostReq = listen(code, r.body.token, s => { hostState = s; });
  const players = [];
  for (let i = 0; i < nPlayers; i++) {
    const j = await post('/api/join', { code, name: 'Student ' + (i + 1) });
    ok(j.status === 200, label + ': join ' + i);
    const pl = { token: j.body.token, id: j.body.id, state: null, acted: '' };
    pl.req = listen(code, pl.token, s => { pl.state = s; drive(pl); });
    players.push(pl);
  }
  const leaks = [];
  async function drive(pl) {
    const s = pl.state; if (s.phase !== 'playing' || s.paused) return;
    // server must never send answers before the reveal
    if (s.stage === 'answer') { const t = JSON.stringify(s.turn); if (/correctIndex|"accept"|answerText|"why"|"notes"/.test(t)) leaks.push(t.slice(0, 200)); }
    const key = s.round + ':' + s.turn.sideId + ':' + s.stage + ':' + (s.turn.territory || '');
    if (pl.acted === key || !s.youSpeak) return;
    const side = s.you.sideId;
    if (s.stage === 'choose' && s.turn.sideId === side) {
      pl.acted = key;
      const L = s.legal; const opts = [];
      L.claim.forEach(t => opts.push(['claim', t])); L.challenge.forEach(t => opts.push(['challenge', t])); L.reinforce.forEach(t => opts.push(['reinforce', t]));
      ok(opts.length > 0, label + ': side has a legal move');
      // try an illegal move first
      const all = s.map.territories.map(t => t.id); const illegal = all.find(t => !L.claim.includes(t));
      if (illegal) { const x = await post('/api/act', { code, token: pl.token, type: 'choose', action: 'claim', territory: illegal }); ok(x.status === 400, label + ': illegal claim refused'); }
      const pick = opts[Math.floor(Math.random() * opts.length)];
      const x = await post('/api/act', { code, token: pl.token, type: 'choose', action: pick[0], territory: pick[1] });
      ok(x.status === 200, label + ': legal move accepted ' + JSON.stringify(x.body));
    } else if (s.stage === 'answer' && (s.turn.sideId === side || s.turn.defender === side) && !s.turn.answered[side]) {
      pl.acted = key;
      // look the answer up directly in the bank (the test is allowed to; a browser cannot)
      const q = (banks[config.system || 'nervous'] || (banks[config.system || 'nervous'] = bank.loadBank(config.system || 'nervous'))).find(c => c.id === room.match.turn.qid);
      const right = Math.random() < skill[players.indexOf(pl) % skill.length];
      const ans = q.type === 'mc' ? (right ? q.correctIndex : (q.correctIndex + 1) % 4) : (right ? q.accept[0].toUpperCase() : 'wrong thing');
      const x = await post('/api/act', { code, token: pl.token, type: 'answer', answer: ans });
      ok(x.status === 200 || /already/.test(x.body.error || ''), label + ': answer accepted ' + JSON.stringify(x.body));
    }
  }
  await sleep(200);
  ok(hostState && hostState.players.length === nPlayers && hostState.players.every(p => p.connected), label + ': host lobby shows every player connected');
  // a non-spokesperson / wrong seat cannot act
  const x0 = await post('/api/act', { code, token: 'bogus', type: 'start' }); ok(x0.status === 403, label + ': unknown token refused');
  const x1 = await post('/api/act', { code, token: players[0].token, type: 'start' }); ok(x1.status === 400, label + ': a student cannot start the match');
  const st = await post('/api/act', { code, token: r.body.token, type: 'start' }); ok(st.status === 200, label + ': host starts ' + JSON.stringify(st.body));
  // pause and resume
  await sleep(300);
  await post('/api/act', { code, token: r.body.token, type: 'pause' }); await sleep(150);
  ok(hostState.paused === true, label + ': pause reaches the host view');
  const px = await post('/api/act', { code, token: players[0].token, type: 'answer', answer: 0 }); ok(px.status === 400, label + ': no answers while paused');
  await post('/api/act', { code, token: r.body.token, type: 'resume' });
  // drop one player mid-match and bring them back with the same token
  await sleep(500); const victim = players[players.length - 1]; victim.req.destroy(); await sleep(300);
  ok(hostState.players.find(p => p.id === victim.id).connected === false, label + ': disconnect shows in host view');
  const rj = await post('/api/join', { code, token: victim.token, name: 'ignored' }); ok(rj.body.id === victim.id, label + ': rejoin keeps the same seat');
  victim.req = listen(code, victim.token, s => { victim.state = s; drive(victim); }); await sleep(300);
  ok(hostState.players.find(p => p.id === victim.id).connected === true, label + ': reconnect shows in host view');
  for (let i = 0; i < 1200 && (!hostState || hostState.phase !== 'ended'); i++) await sleep(100);
  ok(hostState.phase === 'ended', label + ': match reached the end');
  ok(leaks.length === 0, label + ': no answer data sent before reveal ' + leaks[0]);
  const m = room.match;
  // invariants
  const owners = Object.values(m.territories);
  ok(owners.every(t => (t.owner ? t.strength >= 1 && t.strength <= 3 : t.strength === 0)), label + ': strengths stay in range');
  const total = hostState.sides.reduce((a, s) => a + s.territories, 0); ok(total === owners.filter(t => t.owner).length, label + ': ownership counts agree');
  ok(hostState.summary.sides.length === hostState.sides.length, label + ': host summary covers every side');
  const mine = players[0].state.summary; ok(mine.sides.length === 1 && mine.sides[0].sideId === players[0].state.you.sideId, label + ': a player gets only their own side summary');
  if (config.mode === 'team') { const sp = new Set(); m.sides.forEach(s => sp.add(s.spokes)); ok(m.sides.some(s => s.members.length > 1), label + ': teams have several members'); }
  // practice next
  const pr = await post('/api/practice', { code, token: players[0].token, type: 'start' });
  ok(pr.status === 200 && (pr.body.done || (pr.body.question && !('correctIndex' in pr.body.question))), label + ': practice question served without its answer');
  if (pr.body.question) { const a = await post('/api/practice', { code, token: players[0].token, type: 'answer', answer: pr.body.question.type === 'mc' ? 0 : 'x' }); ok(a.status === 200 && a.body.result && a.body.result.reveal.answerText, label + ': practice answer checked and explained'); }
  console.log(label, 'ended by', hostState.endReason, '| round', hostState.round, '|', hostState.sides.map(s => s.name + ' ' + s.points + 'pts/' + s.territories + 't').join(', '));
  hostReq.destroy(); players.forEach(p => p.req.destroy());
}

(async () => {
  await new Promise(r => server.listen(0, r)); base = 'http://127.0.0.1:' + server.address().port;
  // answer matching checks
  ok(bank.typedCorrect('thalmus', ['Thalamus']) && bank.typedCorrect('  CEREBRAL aquaduct ', ['Cerebral Aqueduct']) && !bank.typedCorrect('hypothalamus', ['Thalamus']) && !bank.typedCorrect('pons', ['Medulla Oblongata']) && !bank.typedCorrect('', ['Pons']), 'typed answer matching');
  await Promise.all([
    playMatch('individual', { mode: 'individual', rounds: 6, content: 'both', level: 'college', answerSeconds: 20 }, 4, [0.9, 0.6, 0.5, 0.3]),
    playMatch('team', { mode: 'team', teams: 3, rounds: 6, content: 'anatomy', level: 'highschool', answerSeconds: 20 }, 9, [0.8, 0.5, 0.4]),
    playMatch('histology-only', { mode: 'individual', rounds: 3, content: 'anatomy', gross: false, histology: true, level: 'college', answerSeconds: 20 }, 2, [0.7]),
    ...Object.keys(bank.loadSystems()).filter(id => id !== 'nervous').map(id => playMatch('system ' + id, { system: id, mode: 'team', teams: 2, rounds: 4, content: 'both', level: 'college', answerSeconds: 20 }, 4, [0.8, 0.5])),
    playMatch('timed', { mode: 'team', teams: 2, rounds: 20, matchMinutes: 0.1, content: 'physiology', level: 'foundations', answerSeconds: 20 }, 4, [0.7])
  ]);
  console.log(checks + ' checks, ' + fails + ' failed');
  process.exit(fails ? 1 : 0);
})();

/* Atlas Command - multiplayer server
   Plain Node.js, no packages to install.  Start with:  node server/server.js
   Rooms live in this process's memory. If the server restarts, open rooms are lost. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bank = require('./bank');
const engine = require('./engine');

const PORT = Number(process.env.PORT || 8787);
const PUBLIC = path.join(__dirname, '..', 'public');
const TEACHER_CODE = process.env.TEACHER_CODE || crypto.randomBytes(4).toString('hex');
const ROOM_HOURS = 6;
const MAX_SIDES = 6;

const SYSTEMS = bank.loadSystems();
const IMAGE_BASES = bank.loadImageBases();
let remoteImages = true;      // set false at start-up if the Loops site cannot be reached
const BANKS = {};
for (const id of Object.keys(SYSTEMS)) BANKS[id] = bank.loadBank(id);

const SIDE_STYLES = [
  { name: 'Delta', emblem: 'triangle' }, { name: 'Prism', emblem: 'diamond' }, { name: 'Hex', emblem: 'hexagon' },
  { name: 'Nova', emblem: 'star' }, { name: 'Orbit', emblem: 'ring' }, { name: 'Cross', emblem: 'cross' }
];

const rooms = new Map();
const rid = n => crypto.randomBytes(n).toString('hex');
function roomCode() {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  for (;;) { let c = ''; for (let i = 0; i < 5; i++) c += abc[crypto.randomInt(abc.length)]; if (!rooms.has(c)) return c; }
}
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);

function publicSystem(id) {
  const s = SYSTEMS[id];
  return { id, name: s.name, views: s.views, territories: s.territories, connections: s.connections, linkLabels: s.linkLabels || { border: 'Regions touch', pathway: 'Linked' } };
}

function normConfig(c) {
  c = c || {};
  const cfg = {
    system: SYSTEMS[c.system] ? c.system : 'nervous',
    content: ['anatomy', 'physiology', 'both'].includes(c.content) ? c.content : 'both',
    gross: c.gross !== false, histology: c.histology !== false,
    level: ['foundations', 'highschool', 'college'].includes(c.level) ? c.level : 'college',
    mode: c.mode === 'team' ? 'team' : 'individual',
    teams: Math.min(MAX_SIDES, Math.max(2, Number(c.teams) || 4)),
    rounds: Math.min(20, Math.max(3, Number(c.rounds) || 8)),
    matchMinutes: Math.min(120, Math.max(0, Number(c.matchMinutes) || 0)),
    answerSeconds: 0
  };
  cfg.answerSeconds = Math.min(300, Math.max(20, Number(c.answerSeconds) || (cfg.mode === 'team' ? 120 : 60)));
  if (cfg.content !== 'physiology' && !cfg.gross && !cfg.histology) cfg.gross = true;
  return cfg;
}

function poolSummary(cfg) {
  const pool = usable(bank.filterBank(BANKS[cfg.system], cfg));
  const per = {};
  SYSTEMS[cfg.system].territories.forEach(t => { per[t.id] = pool.filter(q => q.territory === t.id).length; });
  return { total: pool.length, image: pool.filter(q => q.type === 'image').length, application: pool.filter(q => q.dok >= 2).length,
    systemWide: pool.filter(q => !q.territory).length, perTerritory: per };
}

/* Image questions whose picture is neither on this server nor reachable on the Loops site are left out. */
function localImage(rel) { const f = path.join(bank.DATA, 'images', rel); return f.startsWith(path.join(bank.DATA, 'images')) && fs.existsSync(f) ? f : null; }
function remoteUrl(rel) { const i = rel.indexOf('/'); const base = IMAGE_BASES[rel.slice(0, i)]; return base ? base + rel.slice(i + 1) : null; }
function usable(pool) { return pool.filter(q => q.type !== 'image' || localImage(q.image) || (remoteImages && remoteUrl(q.image))); }
const imgCache = new Map();
async function fetchRemote(rel) {
  if (imgCache.has(rel)) return imgCache.get(rel);
  const r = await fetch(remoteUrl(rel)); if (!r.ok) throw new Error('image ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (imgCache.size > 400) imgCache.delete(imgCache.keys().next().value);
  imgCache.set(rel, buf); return buf;
}

/* ---------- rooms ---------- */
function makeRoom(config) {
  const cfg = normConfig(config);
  const room = { code: roomCode(), hostToken: rid(16), config: cfg, players: new Map(), phase: 'lobby', match: null,
    paused: false, timer: null, deadlineAt: 0, remainingMs: 0, onTimer: null, matchTimer: null, matchEndsAt: 0, matchRemaining: 0,
    img: new Map(), hostStreams: new Set(), practice: new Map(), created: Date.now(), touched: Date.now(), seq: 0 };
  rooms.set(room.code, room);
  return room;
}

function teamSizes(room) {
  const n = new Array(room.config.teams).fill(0);
  room.players.forEach(p => { if (p.team != null && p.team < n.length) n[p.team]++; });
  return n;
}

function sideIdOf(room, p) {
  return room.config.mode === 'team' ? (p.team == null ? null : 't' + p.team) : p.id;
}

function connected(p) { return p.streams.size > 0; }

function spokesperson(room, side) {
  const mem = side.members.map(id => room.players.get(id)).filter(Boolean);
  if (!mem.length) return null;
  for (let i = 0; i < mem.length; i++) { const p = mem[(side.spokes + i) % mem.length]; if (connected(p)) return p; }
  return null;
}

function arm(room, ms, fn) {
  clearTimeout(room.timer);
  room.onTimer = fn; room.deadlineAt = Date.now() + ms;
  room.timer = setTimeout(() => { room.timer = null; if (!room.paused) fn(); }, ms);
}
function disarm(room) { clearTimeout(room.timer); room.timer = null; room.onTimer = null; room.deadlineAt = 0; }

function imgToken(room, rel) {
  const t = rid(12); room.img.set(t, rel); return '/img/' + room.code + '/' + t;
}

function currentQuestion(room) {
  const m = room.match; if (!m || !m.turn || !m.turn.qid) return null;
  return m.pool.find(q => q.id === m.turn.qid) || BANKS[room.config.system].find(q => q.id === m.turn.qid);
}

function startMatch(room) {
  const cfg = room.config; const sys = SYSTEMS[cfg.system];
  let sides;
  if (cfg.mode === 'team') {
    sides = [];
    for (let i = 0; i < cfg.teams; i++) {
      const members = [...room.players.values()].filter(p => p.team === i).map(p => p.id);
      if (members.length) sides.push({ id: 't' + i, name: 'Team ' + SIDE_STYLES[i].name, style: i, members, spokes: 0 });
    }
  } else {
    sides = [...room.players.values()].slice(0, MAX_SIDES).map((p, i) => ({ id: p.id, name: p.name, style: i, members: [p.id], spokes: 0 }));
  }
  if (sides.length < 2) return { error: cfg.mode === 'team' ? 'At least two teams need a player.' : 'At least two players are needed.' };
  const pool = usable(bank.filterBank(BANKS[cfg.system], cfg));
  if (pool.length < 20) return { error: 'Only ' + pool.length + ' questions fit this setup. Widen the content or level.' };
  room.match = engine.newMatch({ system: sys, config: cfg, sides, pool });
  room.phase = 'playing'; room.paused = false; room.img.clear(); room.practice.clear();
  if (cfg.matchMinutes) {
    room.matchEndsAt = Date.now() + cfg.matchMinutes * 60000;
    room.matchTimer = setTimeout(() => matchTimeUp(room), cfg.matchMinutes * 60000);
  } else room.matchEndsAt = 0;
  engine.say(room.match, 'Match started. ' + cfg.rounds + ' rounds.');
  advance(room);
  return { ok: true };
}

function matchTimeUp(room) {
  const m = room.match; if (!m || m.stage === 'ended') return;
  m.timeUp = true;
  engine.say(m, 'Time is up. The match ends after this turn.');
  if (m.stage === 'choose') { disarm(room); engine.end(m, 'time'); finish(room); }
  push(room);
}

function finish(room) {
  disarm(room); clearTimeout(room.matchTimer); room.matchTimer = null; room.matchEndsAt = 0;
  room.phase = 'ended';
}

function advance(room) {
  const m = room.match;
  room.img.clear();
  engine.nextTurn(m, sideId => { const s = m.sides.find(x => x.id === sideId); return !!spokesperson(room, s); });
  if (m.stage === 'ended') { finish(room); return push(room); }
  arm(room, engine.RULES.chooseSeconds * 1000, () => { engine.skipChoose(m); toReveal(room); });
  push(room);
}

function toReveal(room) {
  const m = room.match; const q = currentQuestion(room);
  if (q && m.stage === 'reveal' && q.answerImage) m.turn.answerImg = imgToken(room, q.answerImage);
  arm(room, engine.RULES.revealSeconds * 1000, () => advance(room));
  push(room);
}

function settle(room) {
  const m = room.match;
  engine.resolve(m, currentQuestion(room));
  toReveal(room);
}

/* ---------- what each person is allowed to see ---------- */
function viewFor(room, who) {           // who: player object or 'host'
  const m = room.match; const cfg = room.config;
  const isHost = who === 'host';
  const mySide = isHost ? null : sideIdOf(room, who);
  const v = { code: room.code, phase: room.phase, paused: room.paused, config: cfg, now: Date.now(), seq: ++room.seq,
    you: isHost ? { host: true } : { id: who.id, name: who.name, sideId: mySide, team: who.team },
    players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, team: p.team, connected: connected(p) })),
    styles: SIDE_STYLES, map: publicSystem(cfg.system) };
  if (isHost && room.phase === 'lobby') v.pool = poolSummary(cfg);
  if (!m) return v;
  v.rules = engine.RULES;
  v.sides = m.sides.map(s => { const sp = spokesperson(room, s); return Object.assign({ id: s.id, name: s.name, style: s.style, members: s.members,
    spokesId: sp ? sp.id : null, spokesName: sp ? sp.name : null }, engine.score(m, s.id)); });
  v.territories = m.territories;
  v.round = Math.min(m.round, m.rounds); v.rounds = m.rounds; v.order = m.order;
  v.log = m.log.slice(-14);
  v.matchEndsAt = room.paused ? null : (room.matchEndsAt || null); v.matchRemaining = room.paused ? room.matchRemaining : null;
  v.stage = m.stage;
  if (m.stage === 'ended') {
    v.winners = m.winners; v.endReason = m.endReason;
    v.summary = summaryFor(room, isHost ? null : mySide);
    return v;
  }
  const t = m.turn;
  v.deadline = room.paused ? null : room.deadlineAt; v.remaining = room.paused ? room.remainingMs : null;
  v.turn = { sideId: t.sideId, action: t.action, territory: t.territory, defender: t.defender };
  const mine = !isHost && m.sides.find(s => s.id === mySide);
  const iAmSpokes = mine && spokesperson(room, mine) && spokesperson(room, mine).id === who.id;
  v.youSpeak = !!iAmSpokes;
  if (m.stage === 'choose') { if (mySide === t.sideId || isHost) v.legal = engine.legalMoves(m, t.sideId); }
  if (m.stage === 'answer' || (m.stage === 'reveal' && t.qid)) {
    const q = currentQuestion(room);
    if (!t.qImg && q.type === 'image') t.qImg = imgToken(room, q.image);
    v.turn.question = bank.publicQuestion(q, t.scope, t.qImg);
    v.turn.answered = {}; engine.sidesToAnswer(m).forEach(s => { v.turn.answered[s] = !!t.answers[s]; });
    if (m.stage === 'answer' && mine && cfg.mode === 'team') v.turn.suggestions = t.suggestions[mySide] || {};
    if (m.stage === 'answer' && mine && t.answers[mySide]) v.turn.yourAnswer = t.answers[mySide].answer;
  }
  if (m.stage === 'reveal') {
    v.turn.outcome = t.reveal.outcome; v.turn.effect = t.reveal.effect; v.turn.skipped = !!t.reveal.skipped;
    if (t.qid) {
      const q = currentQuestion(room);
      v.turn.reveal = bank.revealFor(q, t.answerImg);
      v.turn.results = {}; engine.sidesToAnswer(m).forEach(s => { const a = t.answers[s]; v.turn.results[s] = { answer: a.answer, correct: a.correct, timedOut: !!a.timedOut }; });
    }
  }
  return v;
}

function summaryFor(room, sideId) {
  const m = room.match; const all = BANKS[room.config.system];
  const one = sid => {
    const st = m.stats[sid];
    const topics = Object.keys(st.topics).map(k => ({ topic: k, right: st.topics[k].right, total: st.topics[k].total }))
      .sort((a, b) => a.right / a.total - b.right / b.total || b.total - a.total);
    const missed = st.missed.map(x => { const q = all.find(c => c.id === x.qid); return { topic: q.topic, type: q.type, question: q.q,
      given: q.type === 'mc' ? (x.given == null ? null : q.options[x.given]) : x.given, answer: q.answerText, why: q.why || '',
      image: q.type === 'image' ? imgToken(room, q.answerImage || q.image) : null }; });
    return { sideId: sid, topics, missed, practice: topics.filter(t => t.right < t.total).map(t => t.topic) };
  };
  return { standings: engine.standings(m), sides: sideId ? (m.stats[sideId] ? [one(sideId)] : []) : m.sides.map(s => one(s.id)) };
}

function push(room) {
  room.touched = Date.now();
  const send = (res, v) => { try { res.write('data: ' + JSON.stringify(v) + '\n\n'); } catch (e) { /* stream closed */ } };
  room.hostStreams.forEach(res => send(res, viewFor(room, 'host')));
  room.players.forEach(p => { if (p.streams.size) { const v = viewFor(room, p); p.streams.forEach(res => send(res, v)); } });
}

/* ---------- actions ---------- */
function act(room, who, b) {
  const m = room.match; const isHost = who === 'host';
  const type = String(b.type || '');
  if (isHost) {
    if (type === 'config' && room.phase === 'lobby') {
      const keepMode = room.config.mode; room.config = normConfig(Object.assign({}, room.config, b.config));
      if (room.config.mode !== keepMode) room.players.forEach(p => { p.team = null; });
      if (room.config.mode === 'team') room.players.forEach(p => { if (p.team == null || p.team >= room.config.teams) { const n = teamSizes(room); p.team = n.indexOf(Math.min(...n)); } });
      return {};
    }
    if (type === 'team' && room.phase === 'lobby') { const p = room.players.get(b.playerId); const t = Number(b.team); if (p && t >= 0 && t < room.config.teams) p.team = t; return {}; }
    if (type === 'auto' && room.phase === 'lobby') { const ps = [...room.players.values()].sort(() => Math.random() - 0.5); ps.forEach((p, i) => { p.team = i % room.config.teams; }); return {}; }
    if (type === 'kick') { const p = room.players.get(b.playerId); if (p && room.phase === 'lobby') { p.streams.forEach(r => r.end()); room.players.delete(p.id); } return {}; }
    if (type === 'start' && room.phase === 'lobby') return startMatch(room);
    if (type === 'pause' && room.phase === 'playing' && !room.paused) {
      room.paused = true; room.remainingMs = Math.max(0, room.deadlineAt - Date.now()); clearTimeout(room.timer); room.timer = null;
      if (room.matchEndsAt) { room.matchRemaining = Math.max(0, room.matchEndsAt - Date.now()); clearTimeout(room.matchTimer); }
      engine.say(m, 'The host paused the match.'); return {};
    }
    if (type === 'resume' && room.phase === 'playing' && room.paused) {
      room.paused = false; const fn = room.onTimer; if (fn) arm(room, Math.max(1000, room.remainingMs), fn);
      if (room.matchEndsAt) { room.matchEndsAt = Date.now() + room.matchRemaining; room.matchTimer = setTimeout(() => matchTimeUp(room), room.matchRemaining); }
      engine.say(m, 'The match resumed.'); return {};
    }
    if (type === 'end' && room.phase === 'playing') { engine.end(m, 'host'); room.paused = false; finish(room); return {}; }
    if (type === 'lobby' && room.phase === 'ended') { room.phase = 'lobby'; room.match = null; return {}; }
    if (type === 'next' && room.phase === 'playing' && m.stage === 'reveal' && !room.paused) { advance(room); return { silent: true }; }
    return { error: 'That control is not available right now.' };
  }
  if (room.phase !== 'playing' || room.paused) return { error: room.paused ? 'The match is paused.' : 'The match is not running.' };
  const sideId = sideIdOf(room, who); const side = m.sides.find(s => s.id === sideId);
  if (!side) return { error: 'You are not on a side in this match.' };
  const sp = spokesperson(room, side); const speaks = sp && sp.id === who.id;
  if (type === 'choose') {
    if (!speaks) return { error: 'Only the spokesperson can choose.' };
    const r = engine.choose(m, sideId, String(b.action), String(b.territory));
    if (r.error) return r;
    arm(room, room.config.answerSeconds * 1000, () => settle(room));
    return {};
  }
  if (type === 'suggest') {
    if (m.stage !== 'answer' || !engine.sidesToAnswer(m).includes(sideId)) return { error: 'Nothing to suggest on.' };
    const q = currentQuestion(room);
    const val = q.type === 'mc' ? Number(b.answer) : clean(b.answer, 60);
    if (q.type === 'mc' && !(val >= 0 && val < 4)) return { error: 'Pick one of the choices.' };
    (m.turn.suggestions[sideId] || (m.turn.suggestions[sideId] = {}))[who.id] = { name: who.name, answer: val };
    return {};
  }
  if (type === 'answer') {
    if (!speaks) return { error: 'Only the spokesperson can submit.' };
    const q = currentQuestion(room);
    const ans = q && q.type === 'mc' ? Number(b.answer) : clean(b.answer, 120);
    const r = engine.recordAnswer(m, sideId, q, ans, who.id);
    if (r.error) return r;
    const waiting = engine.sidesToAnswer(m).filter(x => !m.turn.answers[x] && spokesperson(room, m.sides.find(y => y.id === x)));
    if (r.allIn || !waiting.length) { settle(room); return { silent: true }; }
    return {};
  }
  if (type === 'next') {
    if (m.stage !== 'reveal') return { error: 'Nothing to continue.' };
    if (!(speaks && sideId === m.turn.sideId)) return { error: 'The acting spokesperson or the host continues.' };
    advance(room); return { silent: true };
  }
  return { error: 'Unknown action.' };
}

/* ---------- practice next (session only) ---------- */
function practice(room, p, b) {
  const m = room.match; if (!m || room.phase !== 'ended') return { error: 'Practice opens when the match is over.' };
  const sideId = sideIdOf(room, p); const st = m.stats[sideId]; if (!st) return { error: 'No results for you in this match.' };
  let s = room.practice.get(p.id);
  if (!s || b.type === 'start') {
    const weak = Object.keys(st.topics).filter(k => st.topics[k].right < st.topics[k].total);
    const missedIds = new Set(st.missed.map(x => x.qid));
    const cands = m.pool.filter(q => weak.includes(q.topic) && !missedIds.has(q.id) && !m.used.has(q.id)).sort(() => Math.random() - 0.5);
    const queue = []; const per = {};
    for (const q of cands) { per[q.topic] = (per[q.topic] || 0) + 1; if (per[q.topic] <= 3) queue.push(q.id); if (queue.length >= 10) break; }
    s = { queue, i: 0, right: 0, open: false, img: null }; room.practice.set(p.id, s);
  }
  const q = () => m.pool.find(c => c.id === s.queue[s.i]);
  if (b.type === 'answer') {
    if (!s.open) return { error: 'No open practice question.' };
    const c = q(); const ans = c.type === 'mc' ? Number(b.answer) : clean(b.answer, 120);
    const correct = bank.checkAnswer(c, ans); if (correct) s.right++;
    s.open = false; s.i++;
    return { result: { correct, reveal: bank.revealFor(c, c.answerImage ? imgToken(room, c.answerImage) : null) }, done: s.i >= s.queue.length, right: s.right, total: s.queue.length, n: s.i };
  }
  if (s.i >= s.queue.length) return { done: true, right: s.right, total: s.queue.length, n: s.i };
  const c = q(); s.open = true;
  return { question: bank.publicQuestion(c, c.territory ? 'territory' : 'system', c.type === 'image' ? imgToken(room, c.image) : null), n: s.i + 1, total: s.queue.length };
}

/* ---------- http ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8' };

function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); }

function body(req, limit) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', c => { n += c.length; if (n > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function whoIs(room, token) {
  if (!token) return null;
  if (token === room.hostToken) return 'host';
  for (const p of room.players.values()) if (p.token === token) return p;
  return null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (req.method === 'GET' && p === '/api/events') {
      const room = rooms.get(String(url.searchParams.get('code') || '').toUpperCase());
      const who = room && whoIs(room, url.searchParams.get('token'));
      if (!who) return json(res, 404, { error: 'Room or seat not found.' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 2000\n\n');
      const set = who === 'host' ? room.hostStreams : who.streams;
      set.add(res);
      const beat = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) { /* closed */ } }, 20000);
      req.on('close', () => { clearInterval(beat); set.delete(res); if (rooms.has(room.code)) push(room); });
      return push(room);
    }
    if (req.method === 'GET' && p.startsWith('/img/')) {
      const [, , code, tok] = p.split('/'); const room = rooms.get(code); const rel = room && room.img.get(tok);
      if (!rel) { res.writeHead(404); return res.end(); }
      const file = localImage(rel);
      const head = { 'Content-Type': MIME[path.extname(rel).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'private, no-store' };
      if (file) { res.writeHead(200, head); return fs.createReadStream(file).pipe(res); }
      if (!remoteUrl(rel)) { res.writeHead(404); return res.end(); }
      try { const buf = await fetchRemote(rel); res.writeHead(200, head); return res.end(buf); } catch (e) { res.writeHead(502); return res.end(); }
    }
    if (req.method === 'POST' && p.startsWith('/api/')) {
      const b = await body(req, p === '/api/import' ? 8e6 : 2e5);
      if (p === '/api/pool') return json(res, 200, poolSummary(normConfig(b.config)));
      if (p === '/api/room') {
        if (String(b.teacherCode || '') !== TEACHER_CODE) return json(res, 403, { error: 'That teacher code is not right.' });
        const room = makeRoom(b.config);
        return json(res, 200, { code: room.code, token: room.hostToken });
      }
      if (p === '/api/import') {
        if (String(b.teacherCode || '') !== TEACHER_CODE) return json(res, 403, { error: 'That teacher code is not right.' });
        const sys = SYSTEMS[b.system] ? b.system : 'nervous';
        const r = bank.validateImport(b.format === 'json' ? 'json' : 'csv', String(b.text || ''), sys, SYSTEMS[sys].territories.map(t => t.id));
        const out = { ok: r.ok, problems: r.problems, total: r.total, accepted: r.good ? r.good.length : 0, review: r.review, rejected: r.rejected,
          preview: (r.good || []).slice(0, 25).map(q => ({ id: q.id, type: q.type, content: q.content, anat: q.anat, territory: q.territory || 'system-wide', dok: q.dok, question: q.q, answer: q.answerText })) };
        if (b.commit && r.ok && r.good.length) { out.saved = bank.saveCustom(sys, r.good); BANKS[sys] = bank.loadBank(sys); }
        return json(res, 200, out);
      }
      const room = rooms.get(String(b.code || '').toUpperCase());
      if (!room) return json(res, 404, { error: 'No room with that code. Check the code with your teacher.' });
      if (p === '/api/join') {
        const again = whoIs(room, b.token);
        if (again && again !== 'host') return json(res, 200, { code: room.code, token: again.token, id: again.id });
        const name = clean(b.name, 24); if (!name) return json(res, 400, { error: 'Type a name to join.' });
        if (room.config.mode === 'individual') {
          if (room.phase !== 'lobby') return json(res, 409, { error: 'This match already started. Wait for the next one.' });
          if (room.players.size >= MAX_SIDES) return json(res, 409, { error: 'This room is full. Individual play holds ' + MAX_SIDES + ' players.' });
        } else if (room.players.size >= 80) return json(res, 409, { error: 'This room is full.' });
        let nm = name, k = 2; const taken = new Set([...room.players.values()].map(x => x.name.toLowerCase()));
        while (taken.has(nm.toLowerCase())) nm = name + ' ' + (k++);
        const pl = { id: 'p' + rid(5), token: rid(16), name: nm, team: null, streams: new Set() };
        if (room.config.mode === 'team') { const n = teamSizes(room); pl.team = n.indexOf(Math.min(...n)); }
        room.players.set(pl.id, pl);
        if (room.match && room.config.mode === 'team' && room.phase === 'playing') {       // late joiner goes onto an existing team
          let side = room.match.sides.find(s => s.id === 't' + pl.team);
          if (!side) { side = room.match.sides.slice().sort((a, c) => a.members.length - c.members.length)[0]; pl.team = Number(side.id.slice(1)); }
          side.members.push(pl.id);
        }
        push(room);
        return json(res, 200, { code: room.code, token: pl.token, id: pl.id });
      }
      const who = whoIs(room, b.token);
      if (!who) return json(res, 403, { error: 'Your seat in this room was not found. Join again.' });
      if (p === '/api/act') {
        const r = act(room, who, b);
        if (r.error) return json(res, 400, r);
        if (!r.silent) push(room);
        return json(res, 200, { ok: true });
      }
      if (p === '/api/practice') { if (who === 'host') return json(res, 400, { error: 'Practice is for players.' }); const r = practice(room, who, b); return json(res, r.error ? 400 : 200, r); }
      return json(res, 404, { error: 'Not found.' });
    }
    if (req.method === 'GET') {
      if (p === '/healthz') return json(res, 200, { ok: true, rooms: rooms.size });
      if (p === '/api/systems') return json(res, 200, { systems: Object.keys(SYSTEMS).map(id => ({ id, name: SYSTEMS[id].name, questions: usable(BANKS[id]).length })) });
      let rel = p === '/' ? '/index.html' : p;
      const file = path.normalize(path.join(PUBLIC, rel));
      if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      return fs.createReadStream(file).pipe(res);
    }
    res.writeHead(405); res.end();
  } catch (e) {
    try { json(res, 400, { error: 'Bad request.' }); } catch (e2) { /* already sent */ }
  }
});

setInterval(() => {
  const cut = Date.now() - ROOM_HOURS * 3600000;
  rooms.forEach(r => { if (r.touched < cut) { disarm(r); clearTimeout(r.matchTimer); r.hostStreams.forEach(s => s.end()); r.players.forEach(pl => pl.streams.forEach(s => s.end())); rooms.delete(r.code); } });
}, 600000).unref();

if (require.main === module) {
  server.listen(PORT, () => {
    console.log('Atlas Command is running on port ' + PORT);
    const probe = Object.values(BANKS).flat().find(q => q.type === 'image' && !localImage(q.image) && remoteUrl(q.image));
    if (probe) fetchRemote(probe.image).then(() => console.log('Loops images: reachable at ' + IMAGE_BASES.loops))
      .catch(() => { remoteImages = false; console.log('Loops images: NOT reachable at ' + IMAGE_BASES.loops + '. Image questions without a local copy are switched off.'); });
    console.log('Questions loaded: ' + Object.keys(BANKS).map(k => k + ' ' + BANKS[k].length).join(', '));
    console.log(process.env.TEACHER_CODE ? 'Teacher code: set from TEACHER_CODE' : 'Teacher code for this run (set TEACHER_CODE to keep one): ' + TEACHER_CODE);
  });
}
module.exports = { server, rooms, TEACHER_CODE, setRemoteImages: v => { remoteImages = v; } };

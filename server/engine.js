/* Atlas Command - game engine
   One engine for individual and team play. A "side" is one player or one team.
   The engine holds no timers and no network code; the server drives it. */
'use strict';
const bank = require('./bank');

const RULES = {
  maxStrength: 3,
  pointsPerTerritory: 3,
  pointsPerFortLevel: 1,      // each strength level above 1
  pointsPerCorrect: 1,
  chooseSeconds: 45,
  revealSeconds: 25
};

function neighbors(system, id) {
  const out = [];
  for (const c of system.connections) {
    if (c.a === id) out.push(c.b); else if (c.b === id) out.push(c.a);
  }
  return out;
}

function owned(m, sideId) {
  return Object.keys(m.territories).filter(t => m.territories[t].owner === sideId);
}

function score(m, sideId) {
  const mine = owned(m, sideId);
  const fort = mine.reduce((s, t) => s + (m.territories[t].strength - 1), 0);
  const st = m.stats[sideId];
  return { territories: mine.length, fort, correct: st.correct, answered: st.answered,
    points: mine.length * RULES.pointsPerTerritory + fort * RULES.pointsPerFortLevel + st.correct * RULES.pointsPerCorrect };
}

function standings(m) {
  return m.sides.map(s => Object.assign({ sideId: s.id }, score(m, s.id)))
    .sort((a, b) => b.points - a.points || b.territories - a.territories || b.correct - a.correct);
}

function newMatch(opts) {
  const m = {
    system: opts.system, config: opts.config, pool: opts.pool, rnd: opts.rnd || Math.random,
    sides: opts.sides,                       // [{id, name, members:[playerId], spokes:0}]
    territories: {}, stats: {}, used: new Set(),
    round: 1, rounds: opts.config.rounds, order: [], turnPos: -1,
    stage: 'idle', turn: null, log: [], endReason: null, timeUp: false
  };
  for (const t of opts.system.territories) m.territories[t.id] = { owner: null, strength: 0 };
  for (const s of m.sides) m.stats[s.id] = { correct: 0, answered: 0, topics: {}, missed: [] };
  // first round order is random; later rounds go from lowest score to highest
  m.order = m.sides.map(s => s.id).sort(() => m.rnd() - 0.5);
  return m;
}

function tname(m, id) { return m.system.territories.find(t => t.id === id).name; }
function sname(m, id) { return m.sides.find(s => s.id === id).name; }
function say(m, text) { m.log.push({ n: m.log.length + 1, round: m.round, text }); if (m.log.length > 200) m.log.shift(); }

/* What a side may do right now. */
function legalMoves(m, sideId) {
  const mine = owned(m, sideId);
  const all = Object.keys(m.territories);
  const open = all.filter(t => !m.territories[t].owner);
  const reach = new Set();
  mine.forEach(t => neighbors(m.system, t).forEach(n => reach.add(n)));
  const res = { claim: [], reinforce: [], challenge: [], reentry: false };
  if (!mine.length) {
    res.reentry = true;
    if (open.length) res.claim = open;                       // no territory: land anywhere that is open
    else res.challenge = all.filter(t => m.territories[t].owner !== sideId);   // board is full: challenge anywhere
  } else {
    res.claim = open.filter(t => reach.has(t));
    res.challenge = all.filter(t => m.territories[t].owner && m.territories[t].owner !== sideId && reach.has(t));
    res.reinforce = mine.filter(t => m.territories[t].strength < RULES.maxStrength);
  }
  return res;
}

function startRound(m) {
  if (m.round > 1) {
    const pts = {}; m.sides.forEach(s => { pts[s.id] = score(m, s.id).points; });
    const prev = m.order.slice();
    m.order = m.sides.map(s => s.id).sort((a, b) => pts[a] - pts[b] || prev.indexOf(a) - prev.indexOf(b));
  }
  m.turnPos = -1;
}

/* Move to the next side's turn. isActive(sideId) says whether anyone on that side is connected. */
function nextTurn(m, isActive) {
  if (m.stage === 'ended') return;
  if (m.timeUp) return end(m, 'time');
  const full = m.sides.find(s => owned(m, s.id).length === Object.keys(m.territories).length);
  if (full) return end(m, 'network');
  for (let guard = 0; guard < m.sides.length * 2 + 2; guard++) {
    m.turnPos++;
    if (m.turnPos >= m.order.length) {
      m.round++;
      if (m.round > m.rounds) return end(m, 'rounds');
      startRound(m); m.turnPos = 0;
    }
    const sideId = m.order[m.turnPos];
    if (isActive && !isActive(sideId)) { say(m, sname(m, sideId) + ' is not connected. Turn skipped.'); continue; }
    m.stage = 'choose';
    m.turn = { sideId, action: null, territory: null, defender: null, qid: null, scope: null, answers: {}, reveal: null, suggestions: {} };
    return;
  }
  end(m, 'nobody');
}

function choose(m, sideId, action, territory) {
  if (m.stage !== 'choose' || !m.turn || m.turn.sideId !== sideId) return { error: 'It is not your turn to choose.' };
  const legal = legalMoves(m, sideId);
  if (!['claim', 'reinforce', 'challenge'].includes(action) || !legal[action].includes(territory)) return { error: 'That move is not allowed.' };
  const pick = bank.pickQuestion(m.pool, territory, m.used, m.config.level, m.rnd);
  if (!pick) return { error: 'No questions fit this setup.' };
  m.used.add(pick.q.id);
  const t = m.turn;
  t.action = action; t.territory = territory; t.qid = pick.q.id; t.scope = pick.scope;
  t.defender = action === 'challenge' ? m.territories[territory].owner : null;
  m.stage = 'answer';
  say(m, sname(m, sideId) + (action === 'claim' ? ' moves to claim ' : action === 'reinforce' ? ' moves to reinforce ' : ' challenges ' + sname(m, t.defender) + ' for ') + tname(m, territory) + '.');
  return { ok: true, question: pick.q };
}

function sidesToAnswer(m) {
  const t = m.turn; return t.defender ? [t.sideId, t.defender] : [t.sideId];
}

function recordAnswer(m, sideId, q, answer, by) {
  if (m.stage !== 'answer') return { error: 'There is no open question.' };
  if (!sidesToAnswer(m).includes(sideId)) return { error: 'Your side is not answering this question.' };
  if (m.turn.answers[sideId]) return { error: 'Your side already answered.' };
  m.turn.answers[sideId] = { answer, by, correct: bank.checkAnswer(q, answer) };
  return { ok: true, allIn: sidesToAnswer(m).every(s => m.turn.answers[s]) };
}

function tally(m, sideId, q, ans) {
  const st = m.stats[sideId];
  st.answered++;
  const tp = st.topics[q.topic] || (st.topics[q.topic] = { right: 0, total: 0 });
  tp.total++;
  if (ans.correct) { st.correct++; tp.right++; }
  else st.missed.push({ qid: q.id, given: ans.answer });
}

/* Settle the open question. Missing answers count as wrong. */
function resolve(m, q) {
  const t = m.turn; const terr = m.territories[t.territory];
  for (const s of sidesToAnswer(m)) if (!t.answers[s]) t.answers[s] = { answer: null, by: null, correct: false, timedOut: true };
  for (const s of sidesToAnswer(m)) tally(m, s, q, t.answers[s]);
  const A = t.answers[t.sideId].correct;
  const an = sname(m, t.sideId), tn = tname(m, t.territory);
  let outcome, effect = 'none';
  if (t.action === 'claim') {
    if (A) { terr.owner = t.sideId; terr.strength = 1; effect = 'claimed'; outcome = an + ' claims ' + tn + '.'; }
    else outcome = an + ' missed. ' + tn + ' stays open.';
  } else if (t.action === 'reinforce') {
    if (A) { terr.strength = Math.min(RULES.maxStrength, terr.strength + 1); effect = 'reinforced'; outcome = an + ' reinforces ' + tn + ' to strength ' + terr.strength + '.'; }
    else outcome = an + ' missed. ' + tn + ' is unchanged.';
  } else {
    const D = t.answers[t.defender].correct; const dn = sname(m, t.defender);
    if (A && !D) { terr.owner = t.sideId; terr.strength = 1; effect = 'captured'; outcome = an + ' captures ' + tn + ' from ' + dn + '.'; }
    else if (A && D) {
      // Tie. The defender holds, but the territory is worn down. The rally rule lets last place beat first place on a tie.
      const st = standings(m); const first = st[0], last = st[st.length - 1];
      const rally = terr.strength === 1 && m.sides.length > 1 && score(m, t.sideId).territories === last.territories &&
        score(m, t.defender).territories === Math.max(...st.map(x => x.territories)) && score(m, t.defender).territories > score(m, t.sideId).territories;
      if (rally) { terr.owner = t.sideId; terr.strength = 1; effect = 'captured'; outcome = 'Both sides were right. Rally rule: ' + an + ' is in last place and takes ' + tn + ' from the leader.'; }
      else if (terr.strength > 1) { terr.strength--; effect = 'weakened'; outcome = 'Both sides were right. ' + dn + ' holds ' + tn + ', but it drops to strength ' + terr.strength + '.'; }
      else { effect = 'held'; outcome = 'Both sides were right. ' + dn + ' holds ' + tn + '.'; }
    } else if (!A && D) { terr.strength = Math.min(RULES.maxStrength, terr.strength + 1); effect = 'defended'; outcome = dn + ' defends ' + tn + ' and it rises to strength ' + terr.strength + '.'; }
    else { effect = 'held'; outcome = 'Both sides missed. ' + tn + ' is unchanged.'; }
  }
  t.reveal = { outcome, effect };
  m.stage = 'reveal';
  say(m, outcome);
  // rotate the spokesperson on every side that just submitted
  for (const s of sidesToAnswer(m)) { const side = m.sides.find(x => x.id === s); side.spokes = (side.spokes + 1) % Math.max(1, side.members.length); }
  return t.reveal;
}

function skipChoose(m) {
  if (m.stage !== 'choose') return;
  say(m, sname(m, m.turn.sideId) + ' ran out of time to choose. Turn passed.');
  m.stage = 'reveal'; m.turn.reveal = { outcome: sname(m, m.turn.sideId) + ' ran out of time to choose.', effect: 'none', skipped: true };
}

function end(m, reason) {
  m.stage = 'ended'; m.endReason = reason; m.turn = null;
  const st = standings(m);
  const top = st.filter(x => x.points === st[0].points && x.territories === st[0].territories && x.correct === st[0].correct);
  m.winners = top.map(x => x.sideId);
  say(m, 'Match over. ' + (m.winners.length > 1 ? 'Shared win: ' : 'Winner: ') + m.winners.map(w => sname(m, w)).join(' and ') + '.');
}

module.exports = { RULES, newMatch, legalMoves, nextTurn, choose, recordAnswer, resolve, skipChoose, end, score, standings, owned, neighbors, sidesToAnswer, say };

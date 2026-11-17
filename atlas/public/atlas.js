/* Atlas Command - browser client.
   The browser never holds the question bank or any answer key. It shows what the server sends
   and sends back what the player picks. All rules and answers are checked on the server. */
(function () {
'use strict';
const $ = (s, r) => (r || document).querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }, del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } } };

const STYLE = [
  { color: '#E0B861', emblem: 'triangle', pattern: 'diagonal stripes' }, { color: '#5FD0F3', emblem: 'diamond', pattern: 'dots' },
  { color: '#F08BB4', emblem: 'hexagon', pattern: 'horizontal lines' }, { color: '#8EE08A', emblem: 'star', pattern: 'crosshatch' },
  { color: '#B79CFF', emblem: 'ring', pattern: 'vertical lines' }, { color: '#FF9F5A', emblem: 'cross', pattern: 'checks' }
];
const EMB = {
  triangle: '<path d="M12 3 22 21H2Z"/>', diamond: '<path d="M12 2 22 12 12 22 2 12Z"/>', hexagon: '<path d="M12 2l9 5v10l-9 5-9-5V7Z"/>',
  star: '<path d="M12 2l2.9 6.6 7.1.7-5.4 4.7 1.6 7L12 17.3 5.8 21l1.6-7L2 9.3l7.1-.7Z"/>',
  ring: '<circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="4"/>', cross: '<path d="M9 2h6v7h7v6h-7v7H9v-7H2V9h7Z"/>'
};
const emblem = (i, cls) => `<svg class="${cls || 'emb'}" viewBox="0 0 24 24" aria-hidden="true" style="color:${STYLE[i].color}" fill="currentColor">${EMB[STYLE[i].emblem]}</svg>`;
const STORY = [['The neural atlas has ', 'gone dark', '.'], ['Chart its ', 'territories', '.'], ['Establish your ', 'command', '.'], ['Complete the ', 'network', '.'], ['But you are not the only team ', 'entering the map', '.']];
const ACTION = { claim: 'Claim', reinforce: 'Reinforce', challenge: 'Challenge' };

let sess = store.get('atlas.session');
let S = null, prev = null, es = null, offset = 0;
const ui = { view: null, sel: null, pick: null, typed: '', panelKey: '', sound: store.get('atlas.sound') !== false, calm: store.get('atlas.calm') === true, fx: {}, err: '', practice: null, lost: false, setup: null, pool: null };
document.documentElement.classList.toggle('calm', ui.calm);
const calm = () => ui.calm || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

/* ---------- sound (made in the browser, no audio files) ---------- */
let actx = null;
function tone(seq) {
  if (!ui.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    let t = actx.currentTime;
    seq.forEach(([f, d, type]) => { const o = actx.createOscillator(), g = actx.createGain(); o.type = type || 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g).connect(actx.destination); o.start(t); o.stop(t + d + 0.02); t += d * 0.8; });
  } catch (e) { /* audio not available */ }
}
const SFX = { select: [[520, .08]], turn: [[440, .12], [660, .18]], good: [[523, .12], [659, .12], [784, .22]], bad: [[220, .2, 'triangle'], [165, .3, 'triangle']], capture: [[392, .1, 'square'], [523, .1, 'square'], [659, .1, 'square'], [784, .28, 'square']], open: [[330, .1], [392, .14]] };

/* ---------- server calls ---------- */
async function api(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  let j = {}; try { j = await r.json(); } catch (e) { /* empty */ }
  if (!r.ok) throw new Error(j.error || 'The server did not accept that.');
  return j;
}
async function act(type, extra) {
  try { ui.err = ''; await api('/api/act', Object.assign({ code: sess.code, token: sess.token, type }, extra || {})); }
  catch (e) { ui.err = e.message; say(e.message, true); ui.panelKey = ''; render(); }
}
function say(msg, urgent) { const el = $(urgent ? '#alert' : '#live'); el.textContent = ''; setTimeout(() => { el.textContent = msg; }, 30); }

function connect() {
  if (es) es.close();
  es = new EventSource('/api/events?code=' + encodeURIComponent(sess.code) + '&token=' + encodeURIComponent(sess.token));
  es.onmessage = ev => { const v = JSON.parse(ev.data); if (S && v.seq < S.seq && v.code === S.code && v.phase === S.phase && false) return; ui.lost = false; offset = v.now - Date.now(); onState(v); };
  es.onerror = () => {
    ui.lost = true; renderLost();
    if (es.readyState === 2) {                     // the server refused: the room or seat is gone
      fetch('/api/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: sess.code, token: sess.token }) })
        .then(r => { if (r.status === 404 || r.status === 400 || r.status === 409) leave('That room has closed.'); else setTimeout(connect, 2500); })
        .catch(() => setTimeout(connect, 2500));
    }
  };
}
function leave(msg) { if (es) es.close(); es = null; store.del('atlas.session'); sess = null; S = null; ui.err = msg || ''; render(); }

function onState(v) {
  prev = S; S = v;
  if (!ui.view || !S.map.views.find(x => x.id === ui.view)) ui.view = S.map.views[0].id;
  if (prev && prev.territories && S.territories) {
    for (const id in S.territories) { const a = prev.territories[id], b = S.territories[id]; if (a && (a.owner !== b.owner || a.strength !== b.strength)) ui.fx[id] = Date.now(); }
  }
  const stageKey = s => s && s.turn ? s.round + '|' + s.turn.sideId + '|' + s.stage : (s ? s.phase : '');
  if (stageKey(prev) !== stageKey(S)) {
    ui.pick = null; ui.typed = '';
    if (S.phase === 'playing' && S.stage === 'choose') { ui.sel = null; const sd = sideById(S.turn.sideId); say((S.youSpeak && S.you.sideId === S.turn.sideId ? 'Your move. ' : '') + sd.name + ' is choosing. Round ' + S.round + ' of ' + S.rounds + '.'); if (S.youSpeak && S.you.sideId === S.turn.sideId) tone(SFX.turn); }
    if (S.phase === 'playing' && S.stage === 'answer') { tone(SFX.open); const t = S.turn; ui.sel = t.territory; showTerritory(t.territory); say(sideById(t.sideId).name + ' ' + t.action + 's ' + terr(t.territory).name + '. Question open.'); }
    if (S.phase === 'playing' && S.stage === 'reveal') { const e = S.turn.effect; tone(e === 'captured' ? SFX.capture : (e === 'claimed' || e === 'reinforced' || e === 'defended') ? SFX.good : SFX.bad); say(S.turn.outcome); }
    if (S.phase === 'ended' && (!prev || prev.phase !== 'ended')) say('Match over.');
  }
  render();
}

/* ---------- small helpers ---------- */
const sideById = id => (S.sides || []).find(s => s.id === id);
const terr = id => S.map.territories.find(t => t.id === id);
const art = () => (window.ATLAS_MAPS || {})[S.map.id];
function showTerritory(id) { const t = terr(id); if (t && !t.views.includes(ui.view)) ui.view = t.views[0]; }
function links(id) { return S.map.connections.filter(c => c.a === id || c.b === id).map(c => ({ other: c.a === id ? c.b : c.a, kind: c.kind, note: c.note })); }
function legalFor(id) { const L = S.legal; if (!L || S.stage !== 'choose' || !(S.youSpeak && S.you.sideId === S.turn.sideId)) return []; return ['claim', 'reinforce', 'challenge'].filter(a => L[a].includes(id)); }
function secsLeft(deadline, remaining) { if (remaining != null) return Math.ceil(remaining / 1000); if (!deadline) return null; return Math.max(0, Math.ceil((deadline - (Date.now() + offset)) / 1000)); }
const mmss = s => s == null ? '' : Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');

/* ---------- intro ---------- */
let introTimers = [];
function playIntro(done) {
  const el = $('#intro'); el.hidden = false; el.className = '';
  const outline = 'M300 415 C250 422 178 402 142 332 C128 232 222 120 400 95 C566 74 724 120 800 230 C842 290 846 352 816 396 C790 420 742 428 700 430 C750 440 842 452 822 542 C782 582 694 586 646 562 C630 600 640 628 642 650 C650 704 652 748 650 792';
  const inner = 'M438 345 C438 262 480 170 468 88 M300 415 C360 385 420 351 446 345 C504 328 562 318 604 310 L711 330 M722 136 C733 200 724 270 700 428 M546 588 C516 552 510 524 520 506 C546 494 588 486 622 468';
  el.innerHTML = `<svg viewBox="0 0 1000 800" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <path class="trace" pathLength="1" d="${outline}"/><path class="trace" pathLength="1" d="${inner}" style="stroke-width:2;opacity:.7"/>
    ${STYLE.map((s, i) => `<g class="emb-in" style="color:${s.color}" fill="currentColor" transform="translate(${190 + i * 110} 690) scale(2.6)">${EMB[s.emblem]}</g>`).join('')}
  </svg><p class="cap" id="cap" aria-live="polite"></p><button class="btn small skipbtn" id="skip">Skip intro</button>`;
  const cap = $('#cap'), traces = el.querySelectorAll('.trace'), embs = el.querySelectorAll('.emb-in');
  const line = i => { cap.innerHTML = esc(STORY[i][0]) + '<span class="hl">' + esc(STORY[i][1]) + '</span>' + esc(STORY[i][2]); };
  const finish = () => { introTimers.forEach(clearTimeout); introTimers = []; store.set('atlas.introSeen', true); el.classList.add('out'); setTimeout(() => { el.hidden = true; el.innerHTML = ''; done && done(); }, calm() ? 0 : 850); };
  const at = (ms, fn) => introTimers.push(setTimeout(fn, ms));
  $('#skip').onclick = finish; $('#skip').focus();
  el.onkeydown = e => { if (e.key === 'Escape') finish(); };
  if (calm()) { traces.forEach(t => { t.style.strokeDashoffset = 0; }); embs.forEach(g => { g.style.opacity = 1; }); STORY.forEach((_, i) => at(i * 2200, () => line(i))); at(STORY.length * 2200 + 600, finish); return; }
  line(0); tone([[110, 1.2, 'sine']]);
  at(2200, () => { line(1); traces.forEach(t => t.classList.add('go')); tone([[220, .5], [330, .5], [440, .8]]); });
  at(4600, () => line(2)); at(6800, () => line(3));
  at(8800, () => { line(4); embs.forEach((g, i) => setTimeout(() => g.classList.add('go'), i * 130)); tone(SFX.capture); });
  at(12000, finish);
}

/* ---------- rules dialog ---------- */
function rulesHTML() {
  return `<p class="eyebrow">How to play</p><h2 id="rules-h">The <span class="hl">rules</span></h2>
  <h3>Goal</h3><ul><li>Hold territories on the map. Most points when the match ends wins.</li></ul>
  <h3>Your turn: pick one action</h3><ul>
   <li><strong>Claim</strong> an open territory. Answer right and it is yours at strength 1.</li>
   <li><strong>Reinforce</strong> a territory you hold. Answer right and it gains 1 strength (top strength is 3).</li>
   <li><strong>Challenge</strong> another side's territory. Both sides answer the same question.</li></ul>
  <h3>Where you can move</h3><ul>
   <li>Your first claim can be any open territory.</li>
   <li>After that, claim or challenge only territories connected to one you hold.</li>
   <li>Lost everything? You are still in. Claim any open territory, or challenge any territory if none are open.</li></ul>
  <h3>How a challenge is settled</h3><ul>
   <li>Challenger right, defender wrong: the challenger captures it at strength 1.</li>
   <li>Both right: the defender holds, but the territory loses 1 strength (never below 1).</li>
   <li>Challenger wrong, defender right: the defender holds and gains 1 strength.</li>
   <li>Both wrong: nothing changes.</li>
   <li>Rally rule: if the side with the fewest territories challenges the side with the most, and both are right on a strength 1 territory, the challenger takes it.</li></ul>
  <h3>Turns and time</h3><ul>
   <li>Round 1 order is random. After that, the lowest score goes first each round.</li>
   <li>You have 45 seconds to choose a move. A question left unanswered when time runs out counts as a miss.</li>
   <li>In team play the spokesperson changes every time your team answers. Teammates can suggest an answer.</li></ul>
  <h3>Scoring</h3><ul>
   <li>3 points for each territory you hold.</li><li>1 point for each strength level above 1.</li><li>1 point for every correct answer, in any role.</li>
   <li>Ties go to the side with more territories, then more correct answers. If still tied, the win is shared.</li></ul>
  <h3>How a match ends</h3><ul><li>The last round finishes, the match timer runs out (the turn in progress finishes first), one side holds every territory, or the host ends it.</li></ul>
  <h3>Reading the map</h3><ul>
   <li>A solid line means the two regions touch or are continuous in the body.</li>
   <li>A dotted line means a named fiber pathway joins them.</li>
   <li>The board is a simplified drawing for play. Use the images inside questions for anatomy detail.</li></ul>
  <div class="bar" style="margin-top:18px"><button class="btn gold" id="rules-x">Close</button></div>`;
}
function openRules() { const d = $('#rules'); d.innerHTML = rulesHTML(); d.showModal(); $('#rules-x').onclick = () => d.close(); }

/* ---------- shared bits ---------- */
function tools() {
  return `<button class="icon" id="t-sound" aria-pressed="${ui.sound}" aria-label="Sound ${ui.sound ? 'on' : 'off'}" title="Sound">♪</button>
  <button class="icon" id="t-calm" aria-pressed="${ui.calm}" aria-label="Reduced motion ${ui.calm ? 'on' : 'off'}" title="Reduce motion">≋</button>
  <button class="icon" id="t-rules" aria-label="How to play" title="How to play">?</button>`;
}
function bindTools() {
  const s = $('#t-sound'); if (s) s.onclick = () => { ui.sound = !ui.sound; store.set('atlas.sound', ui.sound); if (ui.sound) tone(SFX.select); ui.panelKey = ''; render(); };
  const c = $('#t-calm'); if (c) c.onclick = () => { ui.calm = !ui.calm; store.set('atlas.calm', ui.calm); document.documentElement.classList.toggle('calm', ui.calm); ui.panelKey = ''; render(); };
  const r = $('#t-rules'); if (r) r.onclick = openRules;
}
const foot = () => `<footer>Created by Dr. Sharilyn Rennie. MedMasters Collaborative. The game board is a simplified drawing. Questions and images come from the course question bank.</footer>`;

/* ---------- home ---------- */
function heroArt() {
  const v = window.ATLAS_MAPS.nervous.views.lateral;
  return `<svg class="art" viewBox="80 60 820 760" aria-hidden="true">${Object.keys(v.shapes).map((k, i) => `<path d="${v.shapes[k].d}" fill="rgba(34,34,34,.55)" stroke="${STYLE[i % 6].color}" stroke-width="2.5" style="filter:drop-shadow(0 0 8px ${STYLE[i % 6].color})"/>`).join('')}${v.decor.map(d => `<path class="decor" d="${d}"/>`).join('')}</svg>`;
}
function setupDefaults() { return { system: 'nervous', content: 'both', gross: true, histology: true, level: 'college', mode: 'team', teams: 4, rounds: 8, timer: false, matchMinutes: 20, answerSeconds: 0 }; }
function radio(name, val, label, cur) { return `<label><input type="radio" name="${name}" value="${val}" ${cur === val ? 'checked' : ''}>${label}</label>`; }
function renderHome() {
  const q = new URLSearchParams(location.search); const room = (q.get('room') || '').toUpperCase();
  ui.setup = ui.setup || setupDefaults(); const c = ui.setup;
  $('#main').innerHTML = `
  <section class="hero" aria-labelledby="h1">${heroArt()}<div class="tools">${tools()}</div>
    <p class="eyebrow">Anatomy and Physiology Territory Game</p><h1 id="h1">Atlas <span class="hl">Command</span></h1>
    <p class="note" style="max-width:34ch;margin:10px 0 0">Answer questions. Take territory. Hold the network.</p></section>
  <p class="err" id="home-err" role="alert">${esc(ui.err)}</p>
  <div class="grid2">
   <section class="card" aria-labelledby="join-h"><p class="eyebrow">Students</p><h2 id="join-h" style="font-size:30px;margin:6px 0 14px">Join a <span class="hl">room</span></h2>
    <form id="join"><div class="field"><label for="j-code">Room code</label><input type="text" id="j-code" autocomplete="off" autocapitalize="characters" maxlength="5" value="${esc(room)}" placeholder="5 letters from your teacher"></div>
    <div class="field"><label for="j-name">Your name</label><input type="text" id="j-name" autocomplete="nickname" maxlength="24" placeholder="First name"></div>
    <button class="btn primary" type="submit">Join</button></form>
    <p class="note" style="margin-top:14px">No account and nothing to buy. Use the code your teacher shares.</p></section>
   <section class="card" aria-labelledby="host-h"><p class="eyebrow">Teachers</p><h2 id="host-h" style="font-size:30px;margin:6px 0 14px">Host a <span class="hl">room</span></h2>
    <form id="host">
     <div class="field"><label for="h-code">Teacher code</label><input type="text" id="h-code" autocomplete="off" placeholder="From your teacher membership page"></div>
     <div class="field"><label for="h-sys">Body system</label><select id="h-sys"><option value="nervous">Nervous system</option></select><p class="note">More systems are added as their maps and question sets are built.</p></div>
     <fieldset><legend>Content</legend><div class="choices">${radio('content', 'anatomy', 'Anatomy', c.content)}${radio('content', 'physiology', 'Physiology', c.content)}${radio('content', 'both', 'Both', c.content)}</div></fieldset>
     <fieldset id="anat-set" ${c.content === 'physiology' ? 'hidden' : ''}><legend>Anatomy includes</legend><div class="choices"><label><input type="checkbox" id="h-gross" ${c.gross ? 'checked' : ''}>Gross anatomy</label><label><input type="checkbox" id="h-histo" ${c.histology ? 'checked' : ''}>Histology</label></div></fieldset>
     <fieldset><legend>Level</legend><div class="choices">${radio('level', 'foundations', 'Foundations', c.level)}${radio('level', 'highschool', 'High school', c.level)}${radio('level', 'college', 'College', c.level)}</div></fieldset>
     <fieldset><legend>Play mode</legend><div class="choices">${radio('mode', 'individual', 'Individual (2 to 6 players)', c.mode)}${radio('mode', 'team', 'Team', c.mode)}</div></fieldset>
     <div class="grid2" style="gap:12px"><div class="field" id="teams-f" ${c.mode === 'team' ? '' : 'hidden'}><label for="h-teams">Teams</label><select id="h-teams">${[2, 3, 4, 5, 6].map(n => `<option ${c.teams === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
     <div class="field"><label for="h-rounds">Rounds</label><select id="h-rounds">${[4, 6, 8, 10, 12].map(n => `<option ${c.rounds === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div>
     <fieldset><legend>Match timer</legend><div class="choices"><label><input type="checkbox" id="h-timer" ${c.timer ? 'checked' : ''}>Use a match timer</label></div>
      <div class="field" id="timer-f" ${c.timer ? '' : 'hidden'} style="margin-top:10px"><label for="h-min">Minutes</label><select id="h-min">${[10, 15, 20, 30, 45].map(n => `<option ${c.matchMinutes === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div></fieldset>
     <p class="note" id="pool" aria-live="polite"></p>
     <button class="btn primary" type="submit">Create room</button>
    </form></section>
  </div>
  <div class="bar" style="margin-top:18px"><button class="btn small" id="replay">Replay intro</button><a class="btn small" href="import.html" target="_top" style="text-decoration:none">Import questions</a></div>${foot()}`;
  bindTools();
  $('#replay').onclick = () => playIntro(() => $('#main').focus());
  $('#join').onsubmit = async e => { e.preventDefault(); try { const r = await api('/api/join', { code: $('#j-code').value.trim().toUpperCase(), name: $('#j-name').value }); sess = { code: r.code, token: r.token, host: false }; store.set('atlas.session', sess); ui.err = ''; connect(); } catch (x) { $('#home-err').textContent = x.message; } };
  const read = () => { const f = $('#host'); c.content = f.content.value; c.level = f.level.value; c.mode = f.mode.value; c.gross = $('#h-gross').checked; c.histology = $('#h-histo').checked; c.teams = +$('#h-teams').value; c.rounds = +$('#h-rounds').value; c.timer = $('#h-timer').checked; c.matchMinutes = +$('#h-min').value;
    $('#anat-set').hidden = c.content === 'physiology'; $('#teams-f').hidden = c.mode !== 'team'; $('#timer-f').hidden = !c.timer; pool(); };
  const cfg = () => Object.assign({}, c, { matchMinutes: c.timer ? c.matchMinutes : 0 });
  const pool = async () => { try { const p = await api('/api/pool', { config: cfg() }); $('#pool').textContent = p.total + ' questions fit this setup: ' + p.image + ' image identification, ' + p.application + ' application.' + (c.content !== 'physiology' && !c.gross && !c.histology ? ' Pick gross anatomy, histology or both.' : ''); } catch (e) { /* server not reachable */ } };
  $('#host').onchange = read; pool();
  $('#host').onsubmit = async e => { e.preventDefault(); read(); try { const r = await api('/api/room', { teacherCode: $('#h-code').value.trim(), config: cfg() }); sess = { code: r.code, token: r.token, host: true }; store.set('atlas.session', sess); ui.err = ''; connect(); } catch (x) { $('#home-err').textContent = x.message; $('#home-err').scrollIntoView({ block: 'center' }); } };
}

/* ---------- lobby ---------- */
function cfgPills() {
  const c = S.config; const lv = { foundations: 'Foundations', highschool: 'High school', college: 'College' }[c.level];
  const content = c.content === 'both' ? 'Anatomy and physiology' : c.content === 'anatomy' ? 'Anatomy' : 'Physiology';
  const an = c.content === 'physiology' ? '' : (c.gross && c.histology ? 'Gross and histology' : c.histology ? 'Histology only' : 'Gross only');
  return [S.map.name, content, an, lv, c.mode === 'team' ? 'Team play' : 'Individual play', c.rounds + ' rounds', c.matchMinutes ? c.matchMinutes + ' minute timer' : 'No match timer'].filter(Boolean).map(x => `<span class="pill">${esc(x)}</span>`).join(' ');
}
function renderLobby() {
  const host = S.you.host, team = S.config.mode === 'team';
  const link = location.origin + location.pathname + '?room=' + S.code;
  const rows = S.players.map(p => `<li class="${p.connected ? '' : 'off'}">${team && p.team != null ? emblem(p.team) : ''}<strong>${esc(p.name)}</strong>${p.connected ? '' : '<span class="pill">Disconnected</span>'}<span class="spacer"></span>
    ${team ? (host ? `<label class="sr" for="tm-${p.id}">Team for ${esc(p.name)}</label><select id="tm-${p.id}" data-team="${p.id}" style="width:auto">${Array.from({ length: S.config.teams }, (_, i) => `<option value="${i}" ${p.team === i ? 'selected' : ''}>Team ${S.styles[i].name}</option>`).join('')}</select>` : `<span class="pill">Team ${S.styles[p.team].name}</span>`) : ''}
    ${host ? `<button class="btn small" data-kick="${p.id}" aria-label="Remove ${esc(p.name)}">Remove</button>` : ''}</li>`).join('');
  const me = !host && S.players.find(p => p.id === S.you.id);
  $('#main').innerHTML = `<div class="top"><span class="brand">Atlas <span class="hl">Command</span></span><span class="spacer"></span>${tools()}<button class="btn small" id="leave">${host ? 'Close room' : 'Leave'}</button></div>
  <div class="grid2"><section class="card" aria-labelledby="lob-h"><p class="eyebrow">${host ? 'Share this with your class' : 'You are in'}</p>
    <h2 id="lob-h" class="sr">Room code</h2><p class="codebig" aria-label="Room code ${S.code.split('').join(' ')}">${S.code}</p>
    ${host ? `<p class="note" style="word-break:break-all;margin:12px 0">${esc(link)}</p><div class="bar"><button class="btn small" id="copy">Copy join link</button><span class="note" id="copied" aria-live="polite"></span></div>` : `<p style="margin-top:14px">${team && me && me.team != null ? `${emblem(me.team)} You are on <strong>Team ${S.styles[me.team].name}</strong>.` : 'Waiting for your teacher to start the match.'}</p><p class="note">Keep this page open. The game starts on its own.</p>`}
    <div style="margin-top:16px;display:flex;gap:6px;flex-wrap:wrap">${cfgPills()}</div>
    ${host && S.pool ? `<p class="note" style="margin-top:12px">${S.pool.total} questions fit this setup.</p>` : ''}
    ${host ? `<p class="err" role="alert">${esc(ui.err)}</p><div class="bar"><button class="btn primary" id="start">Start match</button>${team ? '<button class="btn" id="auto">Shuffle teams</button>' : ''}</div>` : ''}
   </section>
   <section class="card" aria-labelledby="pl-h"><h2 id="pl-h" class="eyebrow" style="margin-bottom:12px">Players (${S.players.length})</h2><ul class="plist">${rows || '<li>No one has joined yet.</li>'}</ul></section></div>${foot()}`;
  bindTools();
  $('#leave').onclick = () => { if (host) { if (confirm('Close this room for everyone?')) leave(); } else leave(); };
  if (host) {
    $('#start').onclick = () => act('start'); const a = $('#auto'); if (a) a.onclick = () => act('auto');
    $('#copy').onclick = async () => { try { await navigator.clipboard.writeText(link); $('#copied').textContent = 'Copied.'; } catch (e) { $('#copied').textContent = 'Select the link above and copy it.'; } };
    document.querySelectorAll('[data-team]').forEach(s => { s.onchange = () => act('team', { playerId: s.dataset.team, team: +s.value }); });
    document.querySelectorAll('[data-kick]').forEach(b => { b.onclick = () => act('kick', { playerId: b.dataset.kick }); });
  }
}

/* ---------- map ---------- */
function patternDefs() {
  const marks = ['<path d="M-2 2 2-2M0 12 12 0M10 14 14 10" stroke="C" stroke-width="2.4"/>', '<circle cx="3" cy="3" r="1.8" fill="C"/><circle cx="9" cy="9" r="1.8" fill="C"/>', '<path d="M0 3H12M0 9H12" stroke="C" stroke-width="2"/>',
    '<path d="M0 0 12 12M12 0 0 12" stroke="C" stroke-width="1.6"/>', '<path d="M3 0V12M9 0V12" stroke="C" stroke-width="2"/>', '<path d="M0 0H6V6H0ZM6 6H12V12H6Z" fill="C"/>'];
  return '<defs>' + STYLE.map((s, i) => `<pattern id="pat${i}" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="${s.color}" fill-opacity=".26"/><g opacity=".5">${marks[i].replace(/C/g, s.color)}</g></pattern>`).join('') + '</defs>';
}
function mapSVG() {
  const A = art(), V = A.views[ui.view]; const ids = Object.keys(V.shapes);
  const t = S.turn, active = t && S.stage !== 'choose' ? t.territory : null;
  let out = `<svg class="map" viewBox="${A.viewBox}" role="group" aria-label="${esc(S.map.views.find(x => x.id === ui.view).name)}. ${esc(V.caption)}">${patternDefs()}`;
  (V.backdrop || []).forEach(d => { out += `<path class="backdrop" d="${d}"/>`; });
  ids.forEach(id => { const st = S.territories ? S.territories[id] : { owner: null }; const own = st.owner ? sideById(st.owner) : null; out += `<path d="${V.shapes[id].d}" fill="${own ? `url(#pat${own.style})` : '#161616'}" ${own ? '' : 'fill-opacity=".85"'} pointer-events="none"/>`; });
  (V.decor || []).forEach(d => { out += `<path class="decor" d="${d}"/>`; });
  (V.decorLabels || []).forEach(l => { out += `<text class="dlabel" x="${l.at[0]}" y="${l.at[1]}" text-anchor="middle">${esc(l.text)}</text>`; });
  S.map.connections.forEach(c => { if (V.shapes[c.a] && V.shapes[c.b]) { const a = V.shapes[c.a].at, b = V.shapes[c.b].at; out += `<line class="link ${c.kind}${ui.sel && (c.a === ui.sel || c.b === ui.sel) ? ' on' : ''}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>`; } });
  ids.forEach(id => {
    const sh = V.shapes[id], st = S.territories ? S.territories[id] : { owner: null, strength: 0 }, own = st.owner ? sideById(st.owner) : null, T = terr(id), legal = legalFor(id);
    const cls = ['terr', legal.length ? 'legal' : '', ui.sel === id ? 'selected' : '', active === id ? 'active' : '', ui.fx[id] && Date.now() - ui.fx[id] < 1300 ? 'fx' : ''].join(' ');
    const lab = T.name + '. ' + (own ? 'Held by ' + own.name + ', strength ' + st.strength + ' of 3.' : 'Open.') + (legal.length ? ' You can ' + legal.join(' or ') + '.' : '');
    const ll = (V.labelLines || {})[id];
    out += `<g class="${cls}" role="button" tabindex="0" data-t="${id}" aria-label="${esc(lab)}" aria-pressed="${ui.sel === id}">
      <path class="shape" d="${sh.d}" fill="transparent" ${own ? `style="stroke:${STYLE[own.style].color}"` : ''}/>
      ${ll ? `<line x1="${ll[0][0]}" y1="${ll[0][1]}" x2="${ll[1][0]}" y2="${ll[1][1]}" stroke="#BDBDBD" stroke-width="1.2" pointer-events="none"/>` : ''}
      <g class="badge" transform="translate(${sh.at[0]} ${sh.at[1]})">${own ? `<circle r="19" fill="#000000" stroke="${STYLE[own.style].color}" stroke-width="2"/><g transform="translate(-11 -11) scale(.92)" fill="${STYLE[own.style].color}" style="color:${STYLE[own.style].color}">${EMB[STYLE[own.style].emblem]}</g>${[0, 1, 2].map(i => `<rect x="${-16 + i * 12}" y="23" width="9" height="5" rx="2" fill="${i < st.strength ? STYLE[own.style].color : '#000000'}" stroke="${STYLE[own.style].color}" stroke-width="1"/>`).join('')}` : '<circle r="9" fill="#000000" stroke="#BDBDBD" stroke-width="2" stroke-dasharray="3 3"/>'}</g>
      <text class="tname" x="${sh.label[0]}" y="${sh.label[1]}" text-anchor="middle">${esc(T.name)}</text></g>`;
  });
  return out + '</svg>';
}
function renderMap() {
  const L = S.legal && S.stage === 'choose' && S.youSpeak && S.you.sideId === S.turn.sideId ? S.legal : null;
  const tabs = S.map.views.map(v => { let n = 0; if (L && v.id !== ui.view) { const all = new Set([...L.claim, ...L.reinforce, ...L.challenge]); const here = S.map.views.find(x => x.id === ui.view); all.forEach(id => { const T = terr(id); if (T.views.includes(v.id) && !T.views.includes(here.id)) n++; }); }
    return `<button class="tab" role="tab" aria-selected="${ui.view === v.id}" data-view="${v.id}">${esc(v.name)}${n ? `<span class="dot" aria-label="${n} more moves in this view">${n}</span>` : ''}</button>`; }).join('');
  const box = $('#mapbox');
  box.innerHTML = `<div class="tabs" role="tablist" aria-label="Map views">${tabs}</div>${mapSVG()}
  <div class="legend"><span><svg width="34" height="8" aria-hidden="true"><line x1="0" y1="4" x2="34" y2="4" stroke="#BBBBBB" stroke-width="2"/></svg> Regions touch</span>
  <span><svg width="34" height="8" aria-hidden="true"><line x1="0" y1="4" x2="34" y2="4" stroke="#BBBBBB" stroke-width="3" stroke-dasharray="3 6" stroke-linecap="round"/></svg> Named fiber pathway</span>
  <span>Simplified board, not to scale</span></div>`;
  box.querySelectorAll('[data-view]').forEach(b => { b.onclick = () => { ui.view = b.dataset.view; tone(SFX.select); renderMap(); const nb = box.querySelector('[aria-selected="true"]'); if (nb) nb.focus(); }; });
  box.querySelectorAll('.terr').forEach(g => { const go = () => { ui.sel = g.dataset.t; tone(SFX.select); ui.panelKey = ''; renderMap(); renderPanel(); const again = box.querySelector(`[data-t="${ui.sel}"]`); if (again) again.focus({ preventScroll: true }); };
    g.onclick = go; g.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }; });
}

/* ---------- question panel ---------- */
function whoChip(sideId, extra, cls) { const s = sideById(sideId); return `<span class="who ${cls || ''}">${emblem(s.style)}${esc(s.name)}${extra ? ' · ' + esc(extra) : ''}</span>`; }
function imgHTML(q, src, alt) {
  let ov = '';
  if (q.marker) ov = `<svg viewBox="0 0 ${q.w} ${q.h}" aria-hidden="true">${q.marker.polygons.map(p => `<polygon points="${p.map(pt => pt.join(',')).join(' ')}" fill="rgba(224,184,97,.25)" stroke="#E0B861" stroke-width="${Math.max(3, q.w / 300)}"/>`).join('')}<circle cx="${q.marker.anchor[0]}" cy="${q.marker.anchor[1]}" r="${q.w / 110}" fill="#8A3324" stroke="#fff" stroke-width="${q.w / 400}"/></svg>`;
  return `<div class="qimg"><img src="${esc(src)}" width="${q.w || 1280}" height="${q.h || 720}" alt="${esc(alt)}">${ov}<button type="button" class="btn small zoom" data-zoom="${esc(src)}">Enlarge image</button></div>`;
}
/* One question body, used in matches and in practice. mode: 'answer' (can submit), 'suggest', 'watch', 'reveal' */
function questionHTML(q, o) {
  const tags = `<span class="pill">${esc(q.topic)}</span> <span class="pill">${q.content === 'physiology' ? 'Physiology' : q.anat === 'histology' ? 'Histology' : 'Gross anatomy'}</span> ${q.scope === 'system' ? '<span class="pill">System-wide question</span>' : ''}`;
  let h = `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${tags}</div>`;
  if (q.type === 'image') h += imgHTML(q, o.reveal && o.reveal.answerImage ? o.reveal.answerImage : q.image, o.reveal ? 'Answer image for this question' : 'Question image. The structure to identify is highlighted or marked on the image.');
  h += `<p class="qtext" id="qtext">${esc(q.text)}</p>`;
  if (q.type === 'mc') {
    h += '<ul class="opts" aria-labelledby="qtext">' + q.options.map((t, i) => {
      const sug = o.suggestions ? Object.values(o.suggestions).filter(s => s.answer === i).map(s => s.name) : [];
      let cls = '', tag = '';
      if (o.reveal) { if (i === o.reveal.correctIndex) { cls = 'right'; tag = 'Correct answer'; } else if ((o.given || []).some(g => g.answer === i)) { cls = 'wrong'; tag = 'Chosen'; } }
      const picked = (o.given || []).filter(g => g.answer === i).map(g => g.name);
      return `<li><button class="opt ${cls}" data-opt="${i}" aria-pressed="${ui.pick === i}" ${o.mode === 'answer' || o.mode === 'suggest' ? '' : 'disabled'}><span class="ltr">${'ABCD'[i]}</span><span>${esc(t)}${sug.length ? `<span class="sug">Suggested by ${esc(sug.join(', '))}</span>` : ''}${picked.length ? `<span class="sug">Answer from ${esc(picked.join(', '))}</span>` : ''}</span>${tag ? `<span class="tag">${tag}</span>` : ''}</button></li>`;
    }).join('') + '</ul>';
  } else if (o.mode === 'answer' || o.mode === 'suggest') {
    h += `<div class="field"><label for="ans">${o.mode === 'answer' ? 'Type your answer' : 'Suggest an answer to your spokesperson'}</label><input type="text" id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="100" value="${esc(ui.typed)}"></div>`;
    if (o.suggestions && Object.keys(o.suggestions).length) h += `<p class="note">Suggestions: ${Object.values(o.suggestions).map(s => esc(s.name) + ': ' + esc(s.answer)).join(' · ')}</p>`;
  }
  if (o.reveal) {
    const r = o.reveal;
    if (q.type !== 'mc') h += `<p><strong>Answer:</strong> ${esc(r.answerText)}</p>`;
    if (r.why) h += `<div class="why"><h3>Why</h3><p style="margin:0">${esc(r.why)}</p></div>`;
    if (r.notes && r.notes.length) h += `<details><summary>About each choice</summary><ul style="padding-left:20px;margin:8px 0 0">${r.notes.map((n, i) => `<li><strong>${'ABCD'[i]}.</strong> ${esc(n)}</li>`).join('')}</ul></details>`;
  }
  return h;
}
function renderPanel() {
  const el = $('#panel'); if (!el) return;
  const t = S.turn, my = S.you.sideId, host = S.you.host;
  const key = JSON.stringify([S.stage, S.round, t, S.youSpeak, ui.sel, ui.err, S.paused, S.legal && S.stage === 'choose' ? 1 : 0]);
  if (key === ui.panelKey) return; ui.panelKey = key;
  const inp = $('#ans'); if (inp) ui.typed = inp.value; const hadFocus = document.activeElement && document.activeElement.id === 'ans';
  let h = '';
  if (S.stage === 'answer' || (S.stage === 'reveal' && t.question)) {
    const q = t.question, T = terr(t.territory), involved = my && (my === t.sideId || my === t.defender);
    const answered = involved && t.answered && t.answered[my];
    const mode = S.stage === 'reveal' ? 'reveal' : !involved || answered ? 'watch' : S.youSpeak ? 'answer' : 'suggest';
    const given = S.stage === 'reveal' ? Object.keys(t.results).map(s => ({ answer: t.results[s].answer, name: sideById(s).name })) : [];
    h += `<section class="qpanel" aria-labelledby="qp-h"><p class="eyebrow">${t.action === 'challenge' ? 'Challenge' : ACTION[t.action]} · ${esc(T.name)}</p>
      <h2 id="qp-h" class="sr">${ACTION[t.action]} question for ${esc(T.name)}</h2>
      <div class="vs">${whoChip(t.sideId, t.action === 'challenge' ? 'challenger' : '')}${t.defender ? `<strong>vs</strong>${whoChip(t.defender, 'defender')}` : ''}</div>`;
    if (S.stage === 'answer') h += `<div class="tbar" aria-hidden="true"><i id="tbar"></i></div>`;
    if (S.stage === 'reveal') {
      h += `<p class="outcome">${esc(t.outcome)}</p><div class="res">${Object.keys(t.results).map(s => whoChip(s, t.results[s].timedOut ? 'no answer in time' : t.results[s].correct ? 'correct' : 'missed', t.results[s].correct ? 'ok' : 'no')).join('')}</div>`;
      if (q.type !== 'mc') h += `<p class="note">${Object.keys(t.results).map(s => esc(sideById(s).name) + ' typed: ' + (t.results[s].answer ? esc(t.results[s].answer) : 'nothing')).join(' · ')}</p>`;
    }
    h += questionHTML(q, { mode, suggestions: mode === 'answer' || mode === 'suggest' ? t.suggestions : null, reveal: S.stage === 'reveal' ? t.reveal : null, given });
    if (ui.err) h += `<p class="err" role="alert">${esc(ui.err)}</p>`;
    if (mode === 'answer') h += `<div class="acts"><button class="btn primary" id="submit">${S.config.mode === 'team' ? 'Submit for the team' : 'Submit answer'}</button></div><p class="note">${S.config.mode === 'team' ? 'You are the spokesperson. Talk it over, then submit.' : 'Pick an answer, then submit.'}</p>`;
    if (mode === 'suggest') h += `${q.type !== 'mc' ? '<div class="acts"><button class="btn" id="suggest">Send suggestion</button></div>' : ''}<p class="note">${esc(sideById(my).spokesName || 'Your spokesperson')} submits for your team this turn. ${q.type === 'mc' ? 'Tap a choice to suggest it.' : ''}</p>`;
    if (mode === 'watch') h += `<p class="note">${answered ? 'Your answer is in. Waiting for the other side.' : host ? 'Players are answering.' : 'Watch and think it through. This one is not yours to answer.'}</p>`;
    if (S.stage === 'reveal') h += `<div class="acts">${host || (S.youSpeak && my === t.sideId) ? '<button class="btn gold" id="next">Continue</button>' : ''}<span class="note" id="autonext"></span></div>`;
    h += '</section>';
  } else if (S.stage === 'reveal') {
    h += `<section class="qpanel"><p class="outcome">${esc(t.outcome)}</p><div class="acts">${host ? '<button class="btn gold" id="next">Continue</button>' : ''}<span class="note" id="autonext"></span></div></section>`;
  } else {
    const mine = S.youSpeak && my === t.sideId, sd = sideById(t.sideId);
    if (ui.sel) {
      const T = terr(ui.sel), st = S.territories[ui.sel], own = st.owner ? sideById(st.owner) : null, legal = legalFor(ui.sel);
      h += `<section class="card panel" aria-labelledby="tp-h"><h2 id="tp-h">${esc(T.name)}</h2>
        <p style="margin:0">${own ? `${emblem(own.style)} Held by <strong>${esc(own.name)}</strong>, strength ${st.strength} of 3` : 'Open territory'}</p>
        ${legal.length ? `<div class="acts">${legal.map(a => `<button class="btn ${a === 'challenge' ? 'primary' : 'gold'}" data-act="${a}">${ACTION[a]}${a === 'challenge' ? ' ' + esc(own.name) : ''}</button>`).join('')}</div>` : mine ? '<p class="note">You cannot move here this turn. Pick a territory with a moving gold outline.</p>' : ''}
        ${ui.err ? `<p class="err" role="alert">${esc(ui.err)}</p>` : ''}
        <ul class="conn" aria-label="Connections">${links(ui.sel).map(l => { const o = terr(l.other); const off = !o.views.includes(ui.view); return `<li><strong>${esc(o.name)}</strong> <span class="pill">${l.kind === 'pathway' ? 'Fiber pathway' : 'Regions touch'}</span><br><span class="note">${esc(l.note)}</span> <button class="btn small" data-go="${l.other}" style="margin-left:6px">${off ? 'Show in ' + esc(S.map.views.find(v => v.id === o.views[0]).name) : 'Select'}</button></li>`; }).join('')}</ul></section>`;
    } else {
      h += `<section class="card panel"><h2>${mine ? 'Your move' : 'Waiting'}</h2><p style="margin:0">${mine ? 'Pick a territory with a moving gold outline. Check both map views.' : host ? esc(sd.name) + ' is choosing a move.' : my === t.sideId ? esc(sd.spokesName || 'Your spokesperson') + ' chooses for your team this turn. Help them decide.' : esc(sd.name) + ' is choosing a move. Tap any territory to see its connections.'}</p></section>`;
    }
  }
  el.innerHTML = h;
  el.querySelectorAll('[data-opt]').forEach(b => { b.onclick = () => { const i = +b.dataset.opt; ui.pick = i; tone(SFX.select); el.querySelectorAll('[data-opt]').forEach(x => x.setAttribute('aria-pressed', x === b)); if (!S.youSpeak) act('suggest', { answer: i }); }; });
  const sub = $('#submit'); if (sub) sub.onclick = () => { const q = t.question; if (q.type === 'mc') { if (ui.pick == null) { ui.err = 'Pick an answer first.'; ui.panelKey = ''; return renderPanel(); } act('answer', { answer: ui.pick }); } else { const v = $('#ans').value.trim(); if (!v) { ui.err = 'Type an answer first.'; ui.panelKey = ''; return renderPanel(); } act('answer', { answer: v }); } };
  const sg = $('#suggest'); if (sg) sg.onclick = () => { const v = $('#ans').value.trim(); if (v) act('suggest', { answer: v }); };
  const a2 = $('#ans'); if (a2) { a2.oninput = () => { ui.typed = a2.value; }; a2.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); ($('#submit') || $('#suggest')).click(); } }; if (hadFocus) { a2.focus(); a2.setSelectionRange(a2.value.length, a2.value.length); } }
  const nx = $('#next'); if (nx) nx.onclick = () => act('next');
  el.querySelectorAll('[data-act]').forEach(b => { b.onclick = () => act('choose', { action: b.dataset.act, territory: ui.sel }); });
  el.querySelectorAll('[data-go]').forEach(b => { b.onclick = () => { ui.sel = b.dataset.go; showTerritory(ui.sel); ui.panelKey = ''; renderMap(); renderPanel(); }; });
  ui.err = '';
}

/* ---------- game screen ---------- */
function standHTML() {
  const order = S.sides.slice().sort((a, b) => b.points - a.points || b.territories - a.territories || b.correct - a.correct);
  return `<ol class="stand">${order.map(s => `<li class="${S.turn && S.turn.sideId === s.id ? 'turn' : ''}">${emblem(s.style)}<div><div class="nm">${esc(s.name)}${s.id === S.you.sideId ? ' (you)' : ''}</div><div class="sub">${s.territories} territor${s.territories === 1 ? 'y' : 'ies'} · ${s.correct} of ${s.answered} correct${S.config.mode === 'team' && s.spokesName ? ' · Spokesperson: ' + esc(s.spokesName) : ''}${S.turn && S.turn.sideId === s.id ? ' · Taking a turn' : ''}</div></div><div class="pts" aria-label="${s.points} points">${s.points}</div></li>`).join('')}</ol>`;
}
function bannerHTML() {
  const t = S.turn, sd = sideById(t.sideId), my = S.you.sideId;
  let msg;
  if (S.stage === 'choose') msg = S.youSpeak && my === t.sideId ? 'Your move. Choose a territory.' : `${esc(sd.name)} is choosing.` + (S.config.mode === 'team' ? ` Spokesperson: ${esc(sd.spokesName || 'none connected')}.` : '');
  else if (S.stage === 'answer') { const need = [t.sideId].concat(t.defender ? [t.defender] : []).filter(s => !t.answered[s]); msg = need.includes(my) ? (S.youSpeak ? 'You submit the answer for your side.' : `${esc(sideById(my).spokesName || 'Your spokesperson')} submits for your team.`) : 'Waiting on ' + need.map(s => esc(sideById(s).name)).join(' and ') + '.'; }
  else msg = esc(t.outcome);
  const mine = (S.stage === 'choose' && S.youSpeak && my === t.sideId) || (S.stage === 'answer' && S.youSpeak && (my === t.sideId || my === t.defender) && !t.answered[my]);
  return `<div class="turnbanner ${mine ? 'mine' : ''}">${emblem(sd.style)}<div><strong>${msg}</strong></div><span class="spacer"></span><span class="clock" id="clock" aria-hidden="true"></span></div>`;
}
function renderGame() {
  const host = S.you.host;
  if (!$('#mapbox')) {
    $('#main').innerHTML = `<div class="top"><span class="brand">Atlas <span class="hl">Command</span></span><span class="pill gold" id="roundpill"></span><span class="pill" id="mclock" hidden></span><span class="pill">Room ${S.code}</span><span class="spacer"></span><span id="hostctl" class="bar"></span>${tools()}</div>
    <div id="banner" style="margin-bottom:14px"></div>
    <div class="game"><div class="mapcard" id="mapbox"></div><div class="side"><div id="panel"></div><section class="card panel" aria-labelledby="st-h"><h2 id="st-h">Standings</h2><div id="stand"></div></section><section class="card panel" aria-labelledby="lg-h"><h2 id="lg-h">Match log</h2><ol class="log" id="log"></ol></section></div></div>
    <div id="pausebox"></div>${foot()}`;
    bindTools(); ui.panelKey = '';
  }
  $('#roundpill').textContent = 'Round ' + S.round + ' of ' + S.rounds;
  $('#banner').innerHTML = bannerHTML();
  if (host) { $('#hostctl').innerHTML = `<button class="btn small" id="h-pause">${S.paused ? 'Resume' : 'Pause'}</button><button class="btn small" id="h-end">End match</button>`; $('#h-pause').onclick = () => act(S.paused ? 'resume' : 'pause'); $('#h-end').onclick = () => { if (confirm('End the match now and show results?')) act('end'); }; }
  renderMap(); renderPanel();
  $('#stand').innerHTML = standHTML();
  $('#log').innerHTML = S.log.slice().reverse().map(l => `<li>${esc(l.text)}</li>`).join('');
  $('#pausebox').innerHTML = S.paused ? `<div class="paused" role="status"><div><p class="eyebrow">Paused by the host</p><h2 style="font-size:44px;margin:10px 0">Match <span class="hl">paused</span></h2>${host ? '<button class="btn gold" id="p-res">Resume</button>' : '<p class="note">The match picks up where it stopped.</p>'}</div></div>` : '';
  const pr = $('#p-res'); if (pr) { pr.onclick = () => act('resume'); }
  tick();
}
function tick() {
  if (!S || S.phase !== 'playing') return;
  const s = secsLeft(S.deadline, S.remaining), c = $('#clock');
  if (c) { c.textContent = s == null ? '' : mmss(s); c.classList.toggle('low', s != null && s <= 10); }
  const bar = $('#tbar'); if (bar && s != null) bar.style.width = Math.min(100, s / S.config.answerSeconds * 100) + '%';
  const an = $('#autonext'); if (an && s != null) an.textContent = 'Next turn in ' + s + ' seconds.';
  const mc = $('#mclock'); if (mc) { const m = secsLeft(S.matchEndsAt, S.matchRemaining); mc.hidden = m == null; if (m != null) mc.textContent = 'Match time ' + mmss(m); }
}
setInterval(tick, 250);
function renderLost() { let b = $('#lost'); if (ui.lost && !b) { b = document.createElement('div'); b.id = 'lost'; b.setAttribute('role', 'status'); b.className = 'pill gold'; b.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);background:#000000;z-index:60'; b.textContent = 'Connection lost. Reconnecting.'; document.body.appendChild(b); } else if (!ui.lost && b) b.remove(); }

/* ---------- end of match ---------- */
function renderEnd() {
  const host = S.you.host, my = S.you.sideId, sum = S.summary;
  const reason = { rounds: 'All rounds were played.', time: 'The match timer ran out.', network: 'One side holds every territory.', host: 'The host ended the match.', nobody: 'No side was connected.' }[S.endReason] || '';
  const win = S.winners.map(w => sideById(w));
  const rows = sum.standings.map((s, i) => { const sd = sideById(s.sideId); return `<tr><td>${i + 1}</td><td>${emblem(sd.style)} <strong>${esc(sd.name)}</strong>${sd.id === my ? ' (you)' : ''}</td><td>${s.points}</td><td>${s.territories}</td><td>${s.fort}</td><td>${s.correct} of ${s.answered}</td></tr>`; }).join('');
  const block = d => { const sd = sideById(d.sideId);
    return `<section class="card" style="margin-top:18px" aria-label="Results for ${esc(sd.name)}"><div class="bar">${emblem(sd.style)}<h2 style="font-size:24px">${esc(sd.name)}</h2></div>
    <h3 class="eyebrow" style="margin:16px 0 6px">Performance by topic</h3>${d.topics.length ? `<table><thead><tr><th scope="col">Topic</th><th scope="col">Correct</th><th scope="col">Share</th></tr></thead><tbody>${d.topics.map(t => `<tr><td>${esc(t.topic)}</td><td>${t.right} of ${t.total}</td><td><div class="meter" role="img" aria-label="${Math.round(t.right / t.total * 100)} percent"><i style="width:${t.right / t.total * 100}%"></i></div></td></tr>`).join('')}</tbody></table>` : '<p class="note">No questions answered.</p>'}
    <h3 class="eyebrow" style="margin:16px 0 6px">Needs more practice</h3>${d.practice.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap">${d.practice.map(t => `<span class="pill gold">${esc(t)}</span>`).join('')}</div>` : '<p class="note">Nothing missed.</p>'}
    <h3 class="eyebrow" style="margin:16px 0 6px">Missed questions</h3>${d.missed.length ? d.missed.map(x => `<details><summary>${esc(x.topic)}: ${esc(x.type === 'image' ? 'Image identification' : x.question)}</summary>${x.image ? imgHTML({ w: 1280, h: 720 }, x.image, 'Answer image') : ''}<p><strong>Answer:</strong> ${esc(x.answer)}</p><p class="note">${x.given == null || x.given === '' ? 'No answer was given.' : 'Answer given: ' + esc(x.given)}</p>${x.why ? `<p style="margin-bottom:0">${esc(x.why)}</p>` : ''}</details>`).join('') : '<p class="note">None.</p>'}
    </section>`; };
  $('#main').innerHTML = `<div class="top"><span class="brand">Atlas <span class="hl">Command</span></span><span class="pill">Room ${S.code}</span><span class="spacer"></span>${tools()}<button class="btn small" id="leave">${host ? 'Close room' : 'Leave'}</button></div>
  <section class="hero" style="min-height:200px"><p class="eyebrow">Match over · ${esc(reason)}</p><h1 style="font-size:clamp(34px,5.5vw,64px)">${win.length > 1 ? 'Shared win: ' : ''}<span class="hl">${win.map(w => esc(w.name)).join(' and ')}</span> ${win.length > 1 ? '' : 'holds the network'}</h1></section>
  <section class="card" aria-labelledby="fs-h"><h2 id="fs-h" class="eyebrow" style="margin-bottom:10px">Final standings</h2><div style="overflow:auto"><table><thead><tr><th scope="col">Place</th><th scope="col">Side</th><th scope="col">Points</th><th scope="col">Territories</th><th scope="col">Extra strength</th><th scope="col">Correct</th></tr></thead><tbody>${rows}</tbody></table></div>
  <p class="note" style="margin:10px 0 0">Points: 3 per territory, 1 per strength level above 1, 1 per correct answer.</p></section>
  <p class="note" style="margin-top:16px"><strong>This summary covers this match only.</strong> It is not saved to an account and is gone when the room closes.</p>
  ${host ? `<div class="bar" style="margin-top:8px"><button class="btn primary" id="again">Back to lobby for a new match</button></div>` : `<div class="bar" style="margin-top:8px"><button class="btn primary" id="practice">Practice next</button><span class="note">Up to 10 new questions from the topics your side missed.</span></div><div id="pbox"></div>`}
  ${sum.sides.map(block).join('')}${foot()}`;
  bindTools();
  $('#leave').onclick = () => leave();
  if (host) $('#again').onclick = () => act('lobby'); else { $('#practice').onclick = () => practice('start'); if (ui.practice) renderPractice(); }
}
async function practice(type, answer) {
  try { ui.practice = Object.assign({ last: ui.practice }, await api('/api/practice', { code: sess.code, token: sess.token, type, answer })); ui.pick = null; ui.typed = ''; renderPractice(); }
  catch (e) { $('#pbox').innerHTML = `<p class="err" role="alert">${esc(e.message)}</p>`; }
}
function renderPractice() {
  const p = ui.practice, box = $('#pbox'); if (!box) return;
  let h = '<section class="qpanel" style="margin-top:14px" aria-label="Practice">';
  if (p.result) { const q = p.last.question; h += `<p class="eyebrow">Practice ${p.n} of ${p.total}</p><p class="outcome">${p.result.correct ? 'Correct.' : 'Not this time.'}</p>` + questionHTML(q, { mode: 'reveal', reveal: p.result.reveal, given: [] }) + `<div class="acts"><button class="btn gold" id="p-next">${p.done ? 'Finish' : 'Next question'}</button></div>`; }
  else if (p.done) h += `<p class="eyebrow">Practice finished</p><p class="outcome">${p.total ? p.right + ' of ' + p.total + ' correct.' : 'No practice questions are available for your missed topics.'}</p><p class="note">This practice score is not saved.</p>`;
  else h += `<p class="eyebrow">Practice ${p.n} of ${p.total}</p>` + questionHTML(p.question, { mode: 'answer' }) + `<div class="acts"><button class="btn primary" id="p-sub">Check answer</button></div>`;
  box.innerHTML = h + '</section>';
  box.querySelectorAll('[data-opt]').forEach(b => { b.onclick = () => { ui.pick = +b.dataset.opt; box.querySelectorAll('[data-opt]').forEach(x => x.setAttribute('aria-pressed', x === b)); }; });
  const s = $('#p-sub'); if (s) s.onclick = () => { const q = p.question; const v = q.type === 'mc' ? ui.pick : $('#ans').value.trim(); if (v == null || v === '') return; practice('answer', v); };
  const n = $('#p-next'); if (n) n.onclick = () => practice('next');
  const first = box.querySelector('.qpanel'); if (first) first.scrollIntoView({ block: 'nearest', behavior: calm() ? 'auto' : 'smooth' });
}

/* enlarge any question image */
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-zoom]'); if (!b) return;
  let d = $('#zoomdlg'); if (!d) { d = document.createElement('dialog'); d.id = 'zoomdlg'; d.setAttribute('aria-label', 'Enlarged image'); document.body.appendChild(d); }
  d.innerHTML = `<img src="${esc(b.dataset.zoom)}" alt="Enlarged question image"><div class="bar" style="margin-top:10px"><button class="btn gold" id="zoom-x">Close</button></div>`; d.showModal(); $('#zoom-x').onclick = () => d.close(); });

/* ---------- router ---------- */
let screen = '';
function render() {
  renderLost();
  const next = !sess || !S ? 'home' : S.phase === 'lobby' ? 'lobby' : S.phase === 'playing' ? 'game' : 'end';
  if (next !== screen) { $('#main').innerHTML = ''; ui.panelKey = ''; if (next !== 'end') ui.practice = null; }
  const changed = next !== screen; screen = next;
  if (next === 'home') { if (!sess) renderHome(); else $('#main').innerHTML = '<p class="note">Connecting to the room.</p>'; }
  else if (next === 'lobby') renderLobby();
  else if (next === 'game') renderGame();
  else if (changed || !$('#pbox') && !S.you.host || S.you.host) renderEnd();
  if (changed && next !== 'home') $('#main').focus({ preventScroll: true });
}

if (sess) connect();
render();
if (!store.get('atlas.introSeen') && !sess) playIntro(() => { const f = $('#j-code'); if (f && f.value) $('#j-name').focus(); });
})();

/* Atlas Command - question bank (server side only)
   The bank file never leaves the server. Clients get one question at a time,
   without the answer, and the answer is checked here. */
'use strict';
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');

function loadSystems() {
  return JSON.parse(fs.readFileSync(path.join(DATA, 'systems.json'), 'utf8')).systems;
}

function loadImageBases() {
  const j = JSON.parse(fs.readFileSync(path.join(DATA, 'systems.json'), 'utf8'));
  const b = Object.assign({}, j.imageBases || {});
  if (process.env.LOOPS_IMAGE_BASE) b.loops = process.env.LOOPS_IMAGE_BASE;
  return b;
}

function loadBank(systemId) {
  const out = [];
  for (const f of ['bank-' + systemId + '.json', 'bank-' + systemId + '-custom.json']) {
    const p = path.join(DATA, f);
    if (fs.existsSync(p)) out.push(...JSON.parse(fs.readFileSync(p, 'utf8')).questions);
  }
  return out;
}

/* Which cards fit the host's setup. */
function filterBank(bank, cfg) {
  const maxDok = cfg.level === 'foundations' ? 1 : cfg.level === 'highschool' ? 2 : 3;
  return bank.filter(q => {
    if (q.dok > maxDok) return false;
    if (q.content === 'physiology') return cfg.content !== 'anatomy';
    if (cfg.content === 'physiology') return false;
    if (q.anat === 'histology') return !!cfg.histology;
    return !!cfg.gross;
  });
}

/* Pick a question for a territory. Territory cards first, then system-wide cards.
   College level leans toward application cards (DOK 2 and 3) when there are any. */
function pickQuestion(pool, territory, used, level, rnd) {
  rnd = rnd || Math.random;
  const fresh = pool.filter(q => !used.has(q.id));
  let cands = fresh.filter(q => q.territory === territory);
  let scope = 'territory';
  if (!cands.length) { cands = fresh.filter(q => !q.territory); scope = 'system'; }
  if (!cands.length) { cands = fresh; scope = 'system'; }
  if (!cands.length) { cands = pool.filter(q => q.territory === territory); scope = 'territory'; }   // bank used up: allow repeats
  if (!cands.length) { cands = pool; scope = 'system'; }
  if (!cands.length) return null;
  if (level === 'college' && rnd() < 0.7) {
    const hard = cands.filter(q => q.dok >= 2);
    if (hard.length) cands = hard;
  }
  return { q: cands[Math.floor(rnd() * cands.length)], scope };
}

function normText(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\b(the|a|an)\b/g, ' ').replace(/\s+/g, ' ').trim();
}

function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const prev = new Array(b.length + 1); const cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

/* Typed answers: exact match after tidying, or a small spelling slip on a long enough word. */
function typedCorrect(given, accept) {
  const g = normText(given);
  if (!g) return false;
  return accept.some(a => {
    const t = normText(a);
    if (g === t) return true;
    const allow = t.length >= 10 ? 2 : t.length >= 6 ? 1 : 0;
    return allow > 0 && editDistance(g, t) <= allow;
  });
}

function checkAnswer(q, answer) {
  if (q.type === 'mc') return Number.isInteger(answer) && answer === q.correctIndex;
  return typeof answer === 'string' && typedCorrect(answer.slice(0, 120), q.accept);
}

/* What a player is allowed to see before the answer is in. */
function publicQuestion(q, scope, imgUrl) {
  const o = { type: q.type, text: q.q, topic: q.topic, scope, content: q.content, anat: q.anat || null, source: q.source };
  if (q.type === 'mc') o.options = q.options;
  else { o.image = imgUrl; o.w = q.w; o.h = q.h; if (q.marker) o.marker = q.marker; }
  return o;
}

/* What is shown once the question is settled. */
function revealFor(q, answerImgUrl) {
  return { answerText: q.answerText, correctIndex: q.type === 'mc' ? q.correctIndex : null, why: q.why || '',
    notes: q.type === 'mc' ? (q.notes || []) : [], answerImage: answerImgUrl || null };
}

/* ---------- import (CSV or JSON), with validation ---------- */
function parseCSV(text) {
  const rows = []; let row = [], cell = '', inq = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inq) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inq = false; } else cell += c; }
    else if (c === '"') inq = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}

function validateImport(format, text, system, territoryIds) {
  let items = [];
  const problems = [];
  try {
    if (format === 'json') {
      const j = JSON.parse(text);
      items = Array.isArray(j) ? j : (j.questions || j.cards || []);
    } else {
      const rows = parseCSV(text);
      const head = rows.shift().map(h => h.trim().toLowerCase());
      items = rows.map(r => { const o = {}; head.forEach((h, i) => { o[h] = (r[i] || '').trim(); }); return o; });
    }
  } catch (e) { return { ok: false, problems: ['The file could not be read: ' + e.message], good: [], review: [], rejected: [] }; }
  const good = [], review = [], rejected = [];
  items.forEach((it, n) => {
    const row = n + 1, why = [], flags = [];
    const get = (...ks) => { for (const k of ks) if (it[k] !== undefined && it[k] !== '') return it[k]; return ''; };
    const qtext = get('q', 'question'); if (!qtext) why.push('no question text');
    let options = Array.isArray(it.options) ? it.options : ['optiona', 'optionb', 'optionc', 'optiond'].map(k => it[k]).filter(x => x);
    const image = get('image');
    let type = get('type') || (options.length ? 'mc' : image ? 'image' : 'recall');
    let correctIndex = null, accept = [];
    if (type === 'mc') {
      if (options.length !== 4) why.push('needs exactly four options');
      const c = get('correctindex', 'correct');
      correctIndex = /^[a-d]$/i.test(String(c)) ? 'abcd'.indexOf(String(c).toLowerCase()) : Number(c);
      if (!(Number.isInteger(correctIndex) && correctIndex >= 0 && correctIndex < 4)) why.push('correct answer must be A to D (or 0 to 3)');
    } else if (type === 'image') {
      const a = get('accept', 'answer', 'a');
      accept = Array.isArray(a) ? a : String(a).split('|').map(s => s.trim()).filter(Boolean);
      if (!image) why.push('no image file named');
      if (!accept.length) why.push('no accepted answer');
      if (accept.length && /[\/;]| and /i.test(accept[0])) flags.push('answer looks like more than one structure');
    } else {
      // A recall card with no options. It is NOT turned into multiple choice.
      why.push('recall card with no answer choices: needs four options written by the instructor before it can be used');
    }
    const content = (get('content') || '').toLowerCase();
    if (!['anatomy', 'physiology'].includes(content)) why.push('content must be anatomy or physiology');
    let anat = (get('anat', 'gross_or_histology') || '').toLowerCase() || null;
    if (content === 'anatomy' && !['gross', 'histology'].includes(anat)) why.push('anatomy cards need gross or histology');
    const dok = Number(get('dok', 'difficulty') || 0);
    if (![1, 2, 3].includes(dok)) why.push('dok must be 1, 2 or 3');
    let territory = get('territory') || null;
    if (territory && territory.toLowerCase() === 'system-wide') territory = null;
    if (territory && !territoryIds.includes(territory)) why.push('territory "' + territory + '" is not on this map');
    const whyText = get('why', 'explanation');
    if (!whyText) flags.push('no explanation');
    if (!get('competency', 'competencyid')) flags.push('no competency tag');
    const q = { id: 'custom:' + (get('id') || ('row' + row)), source: 'import', system, type, content, anat: content === 'anatomy' ? anat : null,
      territory, dok, competency: get('competency', 'competencyid') || null, topic: get('topic') || 'Imported', q: qtext, why: whyText, review: flags };
    if (type === 'mc') { q.options = options; q.correctIndex = correctIndex; q.notes = Array.isArray(it.notes) ? it.notes : []; q.answerText = options[correctIndex] || ''; }
    if (type === 'image') { q.image = image; q.answerImage = get('answerimage') || null; q.accept = accept; q.answerText = accept[0] || ''; q.w = Number(get('w')) || 1280; q.h = Number(get('h')) || 720; if (it.marker) q.marker = it.marker; }
    const line = { row, id: q.id, type, question: qtext.slice(0, 120), answer: q.answerText || '', territory: territory || 'system-wide' };
    if (why.length) rejected.push(Object.assign(line, { reasons: why }));
    else if (flags.length) { review.push(Object.assign(line, { reasons: flags })); good.push(q); }
    else good.push(q);
  });
  return { ok: true, problems, total: items.length, good, review, rejected };
}

function saveCustom(system, questions) {
  const p = path.join(DATA, 'bank-' + system + '-custom.json');
  let cur = { system, questions: [] };
  if (fs.existsSync(p)) cur = JSON.parse(fs.readFileSync(p, 'utf8'));
  const byId = new Map(cur.questions.map(q => [q.id, q]));
  questions.forEach(q => byId.set(q.id, q));
  cur.questions = [...byId.values()];
  fs.writeFileSync(p, JSON.stringify(cur));
  return cur.questions.length;
}

module.exports = { DATA, loadImageBases, loadSystems, loadBank, filterBank, pickQuestion, checkAnswer, typedCorrect, normText, publicQuestion, revealFor, validateImport, saveCustom };

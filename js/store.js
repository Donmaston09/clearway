// Progress + spaced repetition. Everything lives in the browser: no accounts, no tracking.
// Leitner-style boxes 0..5. A correct answer moves a card up one box; a wrong answer drops it to box 1.

const KEY = 'clearway:v1';
const MIN = 60 * 1000, DAY = 24 * 60 * MIN;
// How long to wait before showing a card again, per box.
const INTERVALS = [0, 10 * MIN, 1 * DAY, 3 * DAY, 7 * DAY, 21 * DAY];
export const MASTERED_BOX = 4;

const empty = () => ({ cards: {}, mocks: [], hazard: [], streak: { last: null, days: 0 }, settings: {} });

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...empty(), ...JSON.parse(raw) } : empty();
  } catch { return empty(); }
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode: progress lives for this tab only */ }
}

function today() { return new Date().toISOString().slice(0, 10); }

function bumpStreak() {
  const t = today();
  if (state.streak.last === t) return;
  const y = new Date(Date.now() - DAY).toISOString().slice(0, 10);
  state.streak.days = state.streak.last === y ? state.streak.days + 1 : 1;
  state.streak.last = t;
}

export function card(id) {
  return state.cards[id] || { box: 0, due: 0, seen: 0, right: 0, wrong: 0 };
}

export function record(id, correct) {
  const c = { ...card(id) };
  c.seen++;
  if (correct) { c.right++; c.box = Math.min(5, c.box + 1); }
  else { c.wrong++; c.box = 1; }
  c.due = Date.now() + INTERVALS[c.box];
  c.last = Date.now();
  state.cards[id] = c;
  bumpStreak();
  save();
  return c;
}

export function dueIds(questions, now = Date.now()) {
  return questions.filter(q => { const c = state.cards[q.id]; return c && c.due <= now && c.box < 5; }).map(q => q.id);
}

export function weakIds(questions) {
  return questions.filter(q => { const c = state.cards[q.id]; return c && c.wrong > 0 && c.box < MASTERED_BOX; }).map(q => q.id);
}

// Mastery in a topic: unseen = 0, box 5 = 1.
export function topicStats(questions, topicId) {
  const qs = questions.filter(q => q.topic === topicId);
  let seen = 0, mastered = 0, score = 0;
  for (const q of qs) {
    const c = state.cards[q.id];
    if (!c) continue;
    seen++;
    if (c.box >= MASTERED_BOX) mastered++;
    score += c.box / 5;
  }
  return { total: qs.length, seen, mastered, mastery: qs.length ? score / qs.length : 0 };
}

// A rough readiness estimate: blends overall mastery with recent mock-test results.
// It is a study guide, not a prediction of your real test.
export function readiness(questions) {
  const mastery = questions.reduce((s, q) => s + card(q.id).box / 5, 0) / (questions.length || 1);
  const recent = state.mocks.slice(-3);
  if (!recent.length) return Math.round(mastery * 100);
  const mockAvg = recent.reduce((s, m) => s + m.score / m.total, 0) / recent.length;
  return Math.round((mastery * 0.5 + mockAvg * 0.5) * 100);
}

export function addMock(result) { state.mocks.push(result); bumpStreak(); save(); }
export function mocks() { return state.mocks; }
export function addHazard(result) { state.hazard.push(result); bumpStreak(); save(); }
export function hazardResults() { return state.hazard; }
export function streak() {
  const y = new Date(Date.now() - DAY).toISOString().slice(0, 10);
  return state.streak.last === today() || state.streak.last === y ? state.streak.days : 0;
}

export function setting(k, v) {
  if (v === undefined) return state.settings[k];
  state.settings[k] = v; save();
}

export function exportData() { return JSON.stringify(state, null, 2); }
export function importData(json) {
  const data = JSON.parse(json);
  if (typeof data !== 'object' || !data.cards) throw new Error('Not a Clearway progress file');
  state = { ...empty(), ...data }; save();
}
export function reset() { state = empty(); save(); }

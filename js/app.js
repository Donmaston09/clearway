import * as store from './store.js';
import { SCENES, playClip, scoreClip, drawPoster } from './hazard.js';

// Change this to your fork's URL so "Report a problem" opens an issue in the right place.
const REPO = 'https://github.com/Donmaston09/clearway';
const HC = 'https://www.gov.uk/guidance/the-highway-code/';
const MOCK = { count: 50, minutes: 57, pass: 43 };
const HAZARD_PASS = { car: 44, max: 75 };

const app = document.getElementById('app');
let Q = [], TOPICS = [], SECTIONS = {}, byId = new Map(), topicById = new Map();
let VIDEOS = [], VGROUPS = [], videosByQuestion = new Map();
let session = null;     // active practice/mock session
let abortClip = null;   // stops a playing hazard clip when navigating away

// ---------- helpers ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pct = x => Math.round(x * 100);
const go = hash => { location.hash = hash; };

function refLink(ref) {
  const sec = SECTIONS[ref.section];
  if (!sec) return '';
  const label = /^\d|^H\d/.test(ref.rule) ? `Highway Code Rule ${ref.rule}` : `Highway Code: ${ref.rule}`;
  return `<a class="ref" href="${HC}${sec.slug}" target="_blank" rel="noopener">📖 ${esc(label)} <span class="muted">· ${esc(sec.title)}</span></a>`;
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-GB'; u.rate = 0.95;
  speechSynthesis.speak(u);
}

function ring(value, label) {
  const r = 52, c = 2 * Math.PI * r, off = c * (1 - value / 100);
  return `<svg class="ring" viewBox="0 0 120 120" role="img" aria-label="${label}: ${value}%">
    <circle cx="60" cy="60" r="${r}" class="ring-bg"/>
    <circle cx="60" cy="60" r="${r}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${off}"/>
    <text x="60" y="58" class="ring-num">${value}%</text><text x="60" y="78" class="ring-lbl">${label}</text></svg>`;
}

// Click-to-play YouTube facade. Nothing is loaded from YouTube until the learner presses play,
// and then only from the privacy-enhanced youtube-nocookie.com domain.
function videoCard(v, { compact = false } = {}) {
  return `<figure class="video ${compact ? 'compact' : ''}">
    <button class="yt-facade" data-yt="${esc(v.id)}" aria-label="Play video: ${esc(v.title)}">
      <span class="yt-play" aria-hidden="true">▶</span>
      ${compact ? `<span class="yt-title">${esc(v.title)}</span>` : ''}
      <span class="yt-channel">${esc(v.channel)}</span>
    </button>
    ${compact ? '' : `<figcaption><b>${esc(v.title)}</b><span class="muted small">${esc(v.blurb)}</span>
      <a class="small" href="https://www.youtube.com/watch?v=${esc(v.id)}" target="_blank" rel="noopener">Open on YouTube ↗</a></figcaption>`}
  </figure>`;
}

document.addEventListener('click', e => {
  const btn = e.target.closest('.yt-facade');
  if (!btn) return;
  if (!navigator.onLine) { btn.querySelector('.yt-channel').textContent = 'You\'re offline. Videos need an internet connection.'; return; }
  const v = VIDEOS.find(x => x.id === btn.dataset.yt);
  const frame = document.createElement('iframe');
  frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(btn.dataset.yt)}?autoplay=1&rel=0&playsinline=1`;
  frame.title = v ? v.title : 'YouTube video';
  frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.allowFullscreen = true;
  frame.className = 'yt-frame';
  btn.replaceWith(frame);
});

function setNav(route) {
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', a.dataset.route === route));
}

// Pick questions for a practice session: due first, then unseen, then weakest.
function pickPractice(pool, n) {
  const now = Date.now();
  const scored = pool.map(q => {
    const c = store.card(q.id);
    let p = Math.random();
    if (c.seen && c.due <= now && c.box < 5) p += 3;
    else if (!c.seen) p += 2;
    else p += 1 - c.box / 5;
    return { q, p };
  });
  return scored.sort((a, b) => b.p - a.p).slice(0, n).map(x => x.q);
}

// Spread mock-test questions evenly across topics.
function pickMock(n) {
  const groups = TOPICS.map(t => shuffle(Q.filter(q => q.topic === t.id)));
  const out = [];
  while (out.length < Math.min(n, Q.length)) {
    for (const g of shuffle(groups)) if (g.length && out.length < n) out.push(g.pop());
  }
  return shuffle(out);
}

function startSession(kind, questions, extra = {}) {
  session = {
    kind, questions: questions.map(q => ({ ...q, order: shuffle(q.options.map((_, i) => i)) })),
    i: 0, answers: {}, flags: new Set(), started: Date.now(), ...extra,
  };
}

// ---------- views ----------
function viewHome() {
  setNav('home');
  const ready = store.readiness(Q);
  const due = store.dueIds(Q).length, weak = store.weakIds(Q).length;
  const seen = Q.filter(q => store.card(q.id).seen).length;
  const last = store.mocks().slice(-1)[0];
  const hz = store.hazardResults().slice(-1)[0];
  app.innerHTML = `
  <section class="hero card">
    <div class="hero-ring">${ring(ready, 'ready')}</div>
    <div class="hero-text">
      <h1>Free UK driving theory practice</h1>
      <p class="muted">No paywalls, no adverts, no account. Every answer links to the official Highway Code, and your progress stays on this device.</p>
      <div class="stats">
        <span><b>${seen}</b>/${Q.length} questions seen</span>
        <span><b>${store.streak()}</b> day streak 🔥</span>
        ${last ? `<span>Last mock: <b>${last.score}/${last.total}</b></span>` : ''}
        ${hz ? `<span>Last hazard clip: <b>${hz.score}/${hz.max}</b></span>` : ''}
      </div>
    </div>
  </section>

  <section class="actions">
    <a class="action card primary" href="#/review">
      <span class="a-icon">🧠</span><span><b>Smart review</b><small>${due + weak ? `${due} due · ${weak} to fix` : 'Spaced repetition: start here every day'}</small></span>
    </a>
    <a class="action card" href="#/mock"><span class="a-icon">⏱️</span><span><b>Mock test</b><small>${MOCK.count} questions · ${MOCK.minutes} min · pass ${MOCK.pass}</small></span></a>
    <a class="action card" href="#/hazard"><span class="a-icon">🚗</span><span><b>Hazard perception</b><small>Interactive clips scored like the real test</small></span></a>
    <a class="action card" href="#/videos"><span class="a-icon">🎬</span><span><b>Watch &amp; learn</b><small>Official videos from DVSA, National Highways and THINK!</small></span></a>
    <a class="action card" href="#/practice"><span class="a-icon">📚</span><span><b>Practice by topic</b><small>All 14 official topic areas</small></span></a>
  </section>

  <section class="card">
    <h2>Your topics</h2>
    <div class="topic-bars">
      ${TOPICS.map(t => {
        const s = store.topicStats(Q, t.id);
        return `<a class="topic-bar" href="#/practice/${t.id}">
          <span>${t.icon} ${esc(t.name)}</span>
          <span class="bar"><i style="width:${pct(s.mastery)}%"></i></span>
          <small class="muted">${s.mastered}/${s.total}</small></a>`;
      }).join('')}
    </div>
  </section>`;
}

function viewPractice(topicId) {
  setNav('practice');
  if (topicId) {
    const pool = Q.filter(q => q.topic === topicId);
    if (!pool.length) return go('#/practice');
    startSession('practice', pickPractice(pool, 10), { title: topicById.get(topicId).name, back: '#/practice' });
    return go('#/quiz');
  }
  app.innerHTML = `
  <h1>Practice by topic</h1>
  <p class="muted">These are the 14 topic areas in the DVSA car theory test. Each session is 10 questions, choosing ones that are due for review or that you haven't seen yet.</p>
  <div class="grid">
    ${TOPICS.map(t => {
      const s = store.topicStats(Q, t.id);
      return `<a class="card topic" href="#/practice/${t.id}">
        <span class="t-icon">${t.icon}</span><b>${esc(t.name)}</b>
        <span class="bar"><i style="width:${pct(s.mastery)}%"></i></span>
        <small class="muted">${s.seen}/${s.total} seen · ${s.mastered} mastered</small></a>`;
    }).join('')}
  </div>
  <p><a class="btn ghost" href="#" id="all">Mixed practice: 10 questions from all topics</a></p>`;
  document.getElementById('all').onclick = e => { e.preventDefault(); startSession('practice', pickPractice(Q, 10), { title: 'Mixed practice', back: '#/practice' }); go('#/quiz'); };
}

function viewReview() {
  setNav('review');
  const ids = [...new Set([...store.dueIds(Q), ...store.weakIds(Q)])];
  if (!ids.length) {
    const unseen = Q.filter(q => !store.card(q.id).seen);
    app.innerHTML = `
    <div class="card center">
      <h1>🧠 Smart review</h1>
      <p>${Q.some(q => store.card(q.id).seen) ? 'You\'re all caught up. Nothing is due right now.' : 'Answer some questions first. Clearway will remember which ones you find hard.'}</p>
      <p class="muted">Questions you get wrong come back in 10 minutes, then after 1, 3, 7 and 21 days as you get them right. Spacing out practice like this is one of the most reliable ways to remember things.</p>
      ${unseen.length ? `<button class="btn" id="new">Learn ${Math.min(10, unseen.length)} new questions</button>` : ''}
    </div>`;
    document.getElementById('new')?.addEventListener('click', () => { startSession('practice', pickPractice(unseen, 10), { title: 'New questions', back: '#/review' }); go('#/quiz'); });
    return;
  }
  startSession('practice', shuffle(ids.map(id => byId.get(id))).slice(0, 20), { title: 'Smart review', back: '#/' });
  go('#/quiz');
}

function viewMockIntro() {
  setNav('mock');
  const past = store.mocks().slice(-5).reverse();
  app.innerHTML = `
  <div class="card">
    <h1>⏱️ Mock theory test</h1>
    <ul class="rules">
      <li><b>${MOCK.count}</b> multiple-choice questions spread across all topics</li>
      <li><b>${MOCK.minutes} minutes</b> on the clock, like the real test</li>
      <li>Pass mark: <b>${MOCK.pass}/${MOCK.count}</b></li>
      <li>You can flag questions and come back to them. Answers are shown at the end.</li>
    </ul>
    <button class="btn" id="start">Start mock test</button>
    ${past.length ? `<h3>Recent attempts</h3><ul class="history">${past.map(m => `<li class="${m.passed ? 'ok' : 'bad'}">${new Date(m.date).toLocaleDateString('en-GB')} · <b>${m.score}/${m.total}</b> · ${m.passed ? 'Pass' : 'Not yet'} · ${Math.round(m.seconds / 60)} min</li>`).join('')}</ul>` : ''}
    <p class="muted small">The real test also includes a video clip with 3 questions about it. That's on the roadmap.</p>
  </div>`;
  document.getElementById('start').onclick = () => {
    startSession('mock', pickMock(MOCK.count), { title: 'Mock test', back: '#/mock', deadline: Date.now() + MOCK.minutes * 60 * 1000 });
    go('#/quiz');
  };
}

let timerId = null;
function viewQuiz() {
  if (!session) return go('#/');
  clearInterval(timerId);
  const s = session, q = s.questions[s.i], mock = s.kind === 'mock';
  const chosen = s.answers[q.id];
  const revealed = !mock && chosen !== undefined;
  const topic = topicById.get(q.topic);

  app.innerHTML = `
  <div class="quiz">
    <div class="quiz-top">
      <a href="${s.back}" class="muted" id="quit">✕ ${esc(s.title)}</a>
      <span class="muted">${s.i + 1} / ${s.questions.length}</span>
      ${mock ? `<span class="timer" id="timer"></span>` : ''}
    </div>
    <div class="progress"><i style="width:${pct((s.i + (revealed ? 1 : 0)) / s.questions.length)}%"></i></div>
    <article class="card qcard">
      <div class="qmeta"><span class="chip">${topic.icon} ${esc(topic.name)}</span>
        <button class="icon-btn" id="speak" title="Read aloud" aria-label="Read question aloud">🔊</button>
        ${mock ? `<button class="icon-btn ${s.flags.has(q.id) ? 'on' : ''}" id="flag" title="Flag for review" aria-label="Flag question">🚩</button>` : ''}
      </div>
      <h2 class="question">${esc(q.q)}</h2>
      ${q.image ? `<img class="qimg" src="${q.image}" alt="${esc(q.imageAlt || '')}">` : ''}
      <div class="options" role="radiogroup">
        ${q.order.map((oi, n) => {
          let cls = '';
          if (revealed) cls = oi === q.answer ? 'correct' : oi === chosen ? 'wrong' : 'dim';
          else if (chosen === oi) cls = 'picked';
          return `<button class="option ${cls}" data-oi="${oi}" role="radio" aria-checked="${chosen === oi}" ${revealed ? 'disabled' : ''}>
            <kbd>${n + 1}</kbd><span>${esc(q.options[oi])}</span></button>`;
        }).join('')}
      </div>
      ${revealed ? `
      <div class="explain ${chosen === q.answer ? 'is-ok' : 'is-bad'}">
        <b>${chosen === q.answer ? '✓ Correct' : '✗ Not quite'}</b>
        <p>${esc(q.explain)}</p>
        ${refLink(q.ref)}
        ${(videosByQuestion.get(q.id) || []).slice(0, 1).map(v => `<details class="watch"><summary>🎬 Watch: ${esc(v.title)} <span class="muted small">· ${esc(v.channel)}</span></summary>${videoCard(v, { compact: true })}</details>`).join('')}
        <a class="small muted report" target="_blank" rel="noopener" href="${REPO}/issues/new?title=${encodeURIComponent('Question ' + q.id + ': ')}&labels=content">Report a problem with this question</a>
      </div>` : ''}
    </article>
    <div class="quiz-nav">
      ${mock ? `<button class="btn ghost" id="prev" ${s.i === 0 ? 'disabled' : ''}>← Back</button>` : '<span></span>'}
      ${mock
        ? (s.i < s.questions.length - 1 ? `<button class="btn" id="next">Next →</button>` : `<button class="btn" id="finish">Review &amp; finish</button>`)
        : (revealed ? `<button class="btn" id="next">${s.i < s.questions.length - 1 ? 'Next →' : 'See results'}</button>` : '')}
    </div>
    ${mock ? `<div class="navgrid">${s.questions.map((qq, n) => `<button class="${n === s.i ? 'cur' : ''} ${s.answers[qq.id] !== undefined ? 'done' : ''} ${s.flags.has(qq.id) ? 'flag' : ''}" data-n="${n}">${n + 1}</button>`).join('')}</div>` : ''}
  </div>`;

  const answer = oi => {
    if (revealed) return;
    s.answers[q.id] = oi;
    if (!mock) store.record(q.id, oi === q.answer);
    viewQuiz();
    if (!mock) {
      document.getElementById('next')?.focus({ preventScroll: true });
      app.querySelector('.explain')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  };
  app.querySelectorAll('.option').forEach(b => b.onclick = () => answer(+b.dataset.oi));
  document.getElementById('speak').onclick = () => speak(`${q.q}. ${q.order.map((oi, n) => `Option ${n + 1}: ${q.options[oi]}.`).join(' ')}`);
  document.getElementById('flag')?.addEventListener('click', () => { s.flags.has(q.id) ? s.flags.delete(q.id) : s.flags.add(q.id); viewQuiz(); });
  document.getElementById('prev')?.addEventListener('click', () => { s.i--; viewQuiz(); });
  document.getElementById('next')?.addEventListener('click', () => { if (s.i < s.questions.length - 1) { s.i++; viewQuiz(); } else finish(); });
  document.getElementById('finish')?.addEventListener('click', () => {
    const left = s.questions.filter(x => s.answers[x.id] === undefined).length;
    if (!left || confirm(`You have ${left} unanswered question${left > 1 ? 's' : ''}. Finish anyway?`)) finish();
  });
  app.querySelectorAll('.navgrid button').forEach(b => b.onclick = () => { s.i = +b.dataset.n; viewQuiz(); });
  document.getElementById('quit').onclick = e => {
    if (mock && !confirm('Leave this mock test? Your answers will be lost.')) e.preventDefault();
    else session = null;
  };

  if (mock) {
    const tick = () => {
      const left = Math.max(0, s.deadline - Date.now());
      const el = document.getElementById('timer');
      if (el) { el.textContent = `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`; el.classList.toggle('low', left < 5 * 60000); }
      if (!left) { clearInterval(timerId); alert('Time is up!'); finish(); }
    };
    tick(); timerId = setInterval(tick, 1000);
  }
}

function finish() {
  clearInterval(timerId);
  const s = session;
  const correct = s.questions.filter(q => s.answers[q.id] === q.answer).length;
  if (s.kind === 'mock') {
    // Feed the mock into spaced repetition too, so mistakes come back in Smart review.
    for (const q of s.questions) if (s.answers[q.id] !== undefined) store.record(q.id, s.answers[q.id] === q.answer);
    const passMark = Math.ceil(MOCK.pass / MOCK.count * s.questions.length);
    store.addMock({ date: Date.now(), score: correct, total: s.questions.length, passed: correct >= passMark, seconds: Math.round((Date.now() - s.started) / 1000) });
  }
  s.done = true;
  go('#/results');
}

function viewResults() {
  const s = session;
  if (!s?.done) return go('#/');
  const total = s.questions.length;
  const correct = s.questions.filter(q => s.answers[q.id] === q.answer).length;
  const mock = s.kind === 'mock';
  const passMark = Math.ceil(MOCK.pass / MOCK.count * total);
  const wrong = s.questions.filter(q => s.answers[q.id] !== q.answer);
  const byTopic = {};
  for (const q of s.questions) {
    const t = byTopic[q.topic] ??= { right: 0, total: 0 };
    t.total++; if (s.answers[q.id] === q.answer) t.right++;
  }
  app.innerHTML = `
  <div class="card center">
    ${ring(pct(correct / total), 'score')}
    <h1>${mock ? (correct >= passMark ? '🎉 Pass' : 'Not quite yet') : 'Session complete'}</h1>
    <p><b>${correct}/${total}</b> correct${mock ? ` · pass mark ${passMark}` : ''}</p>
    <div class="row">
      <a class="btn" href="${s.back}">${mock ? 'Back to mock tests' : 'Keep practising'}</a>
      <a class="btn ghost" href="#/">Home</a>
    </div>
  </div>
  ${mock ? `<div class="card"><h2>By topic</h2><div class="topic-bars">${Object.entries(byTopic).map(([id, t]) => `
    <div class="topic-bar"><span>${topicById.get(id).icon} ${esc(topicById.get(id).name)}</span><span class="bar"><i style="width:${pct(t.right / t.total)}%"></i></span><small>${t.right}/${t.total}</small></div>`).join('')}</div></div>` : ''}
  ${wrong.length ? `<div class="card"><h2>Review your mistakes</h2>${wrong.map(q => `
    <div class="mistake">
      <p><b>${esc(q.q)}</b></p>
      ${q.image ? `<img class="qimg small" src="${q.image}" alt="${esc(q.imageAlt || '')}">` : ''}
      ${s.answers[q.id] !== undefined ? `<p class="bad">Your answer: ${esc(q.options[s.answers[q.id]])}</p>` : '<p class="bad">Not answered</p>'}
      <p class="ok">Correct: ${esc(q.options[q.answer])}</p>
      <p class="muted">${esc(q.explain)}</p>${refLink(q.ref)}
    </div>`).join('')}<p class="muted small">These questions will come back in Smart review.</p></div>` : ''}`;
}

// ---------- hazard perception ----------
function viewHazardList() {
  setNav('hazard');
  const results = store.hazardResults();
  app.innerHTML = `
  <h1>🚗 Hazard perception</h1>
  <div class="card">
    <p>Click (or tap, or press <kbd>Space</kbd>) as soon as you see a <b>developing hazard</b>, meaning something that would make you change speed or direction. Clicking earlier scores more, up to 5 points. Clicking constantly or in a rhythm scores 0 for the clip, just like the real test.</p>
    <p class="muted small">The real test has 14 clips and 15 developing hazards (out of 75), with a pass mark of ${HAZARD_PASS.car}. These clips are rendered live from open scene files, so anyone can write new ones. See CONTRIBUTING.md.</p>
  </div>
  ${(v => v ? `<details class="card watch"><summary>🎬 New to hazard perception? Watch DVSA's official guide first</summary>${videoCard(v)}</details>` : '')(VIDEOS.find(v => v.id === 'SdQRkmdhwJs'))}
  <div class="grid">
    ${SCENES.map(sc => {
      const best = Math.max(-1, ...results.filter(r => r.id === sc.id).map(r => r.score));
      return `<a class="card clip" href="#/hazard/${sc.id}">
        <canvas data-poster="${sc.id}" aria-hidden="true"></canvas>
        <b>${esc(sc.title)}</b><small class="muted">${esc(sc.blurb)}</small>
        <small>${best >= 0 ? `Best: ${best}/${sc.hazards.length * 5}` : 'Not tried yet'}</small></a>`;
    }).join('')}
  </div>`;
  app.querySelectorAll('canvas[data-poster]').forEach(c => drawPoster(c, SCENES.find(s => s.id === c.dataset.poster), 2));
}

function viewHazardPlay(id) {
  setNav('hazard');
  const scene = SCENES.find(s => s.id === id);
  if (!scene) return go('#/hazard');
  app.innerHTML = `
  <div class="quiz-top"><a href="#/hazard" class="muted">✕ ${esc(scene.title)}</a><span id="flags" class="flags"></span></div>
  <div class="stage">
    <canvas id="clip" tabindex="0" aria-label="Hazard perception clip. Press space or click when you see a developing hazard."></canvas>
    <div class="overlay" id="overlay">
      <h2>${esc(scene.title)}</h2><p>${esc(scene.blurb)}</p>
      <button class="btn" id="go">▶ Start clip</button>
      <p class="small">Click, tap or press <kbd>Space</kbd> when you see a developing hazard</p>
    </div>
  </div>
  <div id="debrief"></div>`;
  const canvas = document.getElementById('clip');
  drawPoster(canvas, scene, 0);
  document.getElementById('go').onclick = async () => {
    document.getElementById('overlay').hidden = true;
    canvas.focus();
    abortClip = new AbortController();
    const flags = document.getElementById('flags');
    const clicks = await playClip(canvas, scene, {
      signal: abortClip.signal,
      onTick: (t, cl) => { flags.textContent = '🚩'.repeat(Math.min(cl.length, 15)); },
    });
    if (!clicks) return;
    const result = scoreClip(scene, clicks);
    store.addHazard({ id: scene.id, date: Date.now(), score: result.score, max: result.max });
    renderDebrief(scene, clicks, result);
  };
}

function renderDebrief(scene, clicks, result) {
  const D = scene.duration, x = t => (t / D * 100).toFixed(2) + '%';
  const el = document.getElementById('debrief');
  el.innerHTML = `
  <div class="card">
    <h2>You scored ${result.score}/${result.max}</h2>
    ${result.cheat ? `<p class="bad">⚠️ ${esc(result.cheat)}. In the real test this scores 0 for the clip.</p>` : ''}
    <div class="timeline" aria-label="Timeline of the clip showing scoring window and your clicks">
      ${result.hazards.map(h => {
        const band = (h.end - h.start) / 5;
        return [5, 4, 3, 2, 1].map((p, i) => `<span class="band b${p}" style="left:${x(h.start + i * band)};width:${x(band)}" title="${p} points"></span>`).join('');
      }).join('')}
      ${clicks.map(c => `<span class="click" style="left:${x(c)}" title="${c.toFixed(1)}s"></span>`).join('')}
    </div>
    <div class="legend small muted"><span><i class="sw b5"></i>5 points</span><span><i class="sw b1"></i>1 point</span><span><i class="sw click"></i>your clicks</span></div>
    ${result.hazards.map(h => `<p><b>${esc(h.label)}</b>: ${h.hit !== undefined ? `you reacted at ${h.hit.toFixed(1)}s, so <b>${h.points} points</b>` : 'missed'} <span class="muted">(window ${h.start}s–${h.end}s)</span></p>`).join('')}
    <p>${esc(scene.debrief)}</p>
    <div class="row">
      <button class="btn" id="replay">Replay with the hazard highlighted</button>
      <a class="btn ghost" href="#/hazard/${scene.id}" id="again">Try again</a>
      <a class="btn ghost" href="#/hazard">All clips</a>
    </div>
  </div>`;
  document.getElementById('again').onclick = e => { e.preventDefault(); viewHazardPlay(scene.id); };
  document.getElementById('replay').onclick = () => {
    abortClip = new AbortController();
    playClip(document.getElementById('clip'), scene, { highlight: true, signal: abortClip.signal });
    document.getElementById('clip').scrollIntoView({ behavior: 'smooth' });
  };
}

// ---------- videos ----------
function viewVideos(groupId) {
  setNav('videos');
  const groups = VGROUPS.filter(g => VIDEOS.some(v => v.group === g.id));
  const shown = groupId ? groups.filter(g => g.id === groupId) : groups;
  app.innerHTML = `
  <h1>🎬 Watch &amp; learn</h1>
  <p class="muted">Free videos from the organisations that set the rules: DVSA, National Highways, the Department for Transport's THINK! campaign, and road-safety charities. Each one plays here in the app.</p>
  <div class="chips" role="navigation" aria-label="Video categories">
    <a class="chip-link ${!groupId ? 'on' : ''}" href="#/videos">All</a>
    ${groups.map(g => `<a class="chip-link ${g.id === groupId ? 'on' : ''}" href="#/videos/${g.id}">${g.icon} ${esc(g.name)}</a>`).join('')}
  </div>
  ${shown.map(g => `
    <section>
      <h2>${g.icon} ${esc(g.name)}</h2>
      <div class="video-grid">${VIDEOS.filter(v => v.group === g.id).map(v => videoCard(v)).join('')}</div>
    </section>`).join('')}
  <p class="muted small">Know a great official video we're missing? <a href="${REPO}/issues/new?title=${encodeURIComponent('Video suggestion: ')}&labels=video" target="_blank" rel="noopener">Suggest it</a>. We only include videos published by the organisation that made them.</p>`;
}

// ---------- about ----------
function viewAbout() {
  setNav('about');
  app.innerHTML = `
  <div class="card prose">
    <h1>About Clearway</h1>
    <p>Clearway is a <b>free, open-source</b> study companion for the UK car theory test. It was built because learning the rules of the road shouldn't be locked behind a subscription.</p>
    <h3>Where the content comes from</h3>
    <ul>
      <li>Every question is <b>written from scratch</b> and based on <a href="${HC}" target="_blank" rel="noopener">The Highway Code</a> (Crown copyright, published under the <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank" rel="noopener">Open Government Licence v3.0</a>). Each answer links to the rule it comes from.</li>
      <li>We <b>don't</b> copy the official DVSA revision question bank, the official hazard clips, or content from other apps. Those are licensed separately. Contributions must be original.</li>
      <li>Questions are released under CC BY-SA 4.0 and the code under MIT, so anyone can reuse, translate or improve them.</li>
    </ul>
    <p class="muted">Clearway isn't affiliated with or endorsed by DVSA. Always check the current rules on GOV.UK, and <a href="https://www.gov.uk/book-theory-test" target="_blank" rel="noopener">book your real test only on GOV.UK</a>.</p>
    <h3>Official free resources</h3>
    <ul>
      <li><a href="https://www.gov.uk/theory-test" target="_blank" rel="noopener">GOV.UK: Theory test overview</a></li>
      <li><a href="https://www.gov.uk/theory-test/hazard-perception-test" target="_blank" rel="noopener">GOV.UK: How the hazard perception test works</a></li>
      <li><a href="https://www.gov.uk/guidance/know-your-traffic-signs" target="_blank" rel="noopener">Know Your Traffic Signs</a></li>
    </ul>
    <h3>Your data</h3>
    <p>Progress is stored only in this browser. There's no account and no analytics. Videos are loaded from YouTube's privacy-enhanced mode only when you press play. You can move your progress to another device:</p>
    <div class="row">
      <button class="btn ghost" id="export">⬇ Export progress</button>
      <label class="btn ghost">⬆ Import progress<input type="file" id="import" accept="application/json" hidden></label>
      <button class="btn ghost danger" id="reset">Reset everything</button>
    </div>
    <h3>Help build it</h3>
    <p>Write questions, design hazard clips, translate, or fix mistakes on <a href="${REPO}" target="_blank" rel="noopener">GitHub</a>.</p>
  </div>`;
  document.getElementById('export').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([store.exportData()], { type: 'application/json' }));
    a.download = `clearway-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  document.getElementById('import').onchange = async e => {
    try { store.importData(await e.target.files[0].text()); alert('Progress imported.'); go('#/'); }
    catch (err) { alert('Could not import: ' + err.message); }
  };
  document.getElementById('reset').onclick = () => { if (confirm('Delete all progress on this device?')) { store.reset(); go('#/'); } };
}

// ---------- router ----------
function route() {
  abortClip?.abort(); abortClip = null;
  clearInterval(timerId);
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  const [, name = '', arg] = location.hash.split('/');
  // A mock in progress survives refreshes of #/quiz only.
  if (name !== 'quiz' && name !== 'results' && session && !session.done && session.kind !== 'mock') session = null;
  const views = {
    '': viewHome, practice: () => viewPractice(arg), review: viewReview, mock: viewMockIntro,
    quiz: viewQuiz, results: viewResults, videos: () => viewVideos(arg), hazard: () => arg ? viewHazardPlay(arg) : viewHazardList(), about: viewAbout,
  };
  (views[name] || viewHome)();
  window.scrollTo(0, 0);
  app.focus({ preventScroll: true });
}

// Keyboard: 1-4 to answer, Enter for next.
window.addEventListener('keydown', e => {
  if (!location.hash.startsWith('#/quiz') || e.target.tagName === 'INPUT') return;
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 4) app.querySelectorAll('.option')[n - 1]?.click();
  if (e.key === 'Enter' && document.activeElement?.tagName !== 'BUTTON') document.getElementById('next')?.click();
});

async function init() {
  const [qs, tp, vd] = await Promise.all(['questions', 'topics', 'videos'].map(f => fetch(`data/${f}.json`).then(r => r.json())));
  VIDEOS = vd.videos; VGROUPS = vd.groups;
  for (const v of VIDEOS) for (const id of v.questions || []) videosByQuestion.set(id, [...(videosByQuestion.get(id) || []), v]);
  Q = qs.questions; TOPICS = tp.topics; SECTIONS = tp.sections;
  byId = new Map(Q.map(q => [q.id, q]));
  topicById = new Map(TOPICS.map(t => [t.id, t]));
  window.addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

init().catch(err => { app.innerHTML = `<div class="card"><h2>Couldn't load questions</h2><p class="muted">${esc(err.message)}. If you opened the file directly, run a local server instead (see README).</p></div>`; });

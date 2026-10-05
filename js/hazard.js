// Open hazard-perception engine.
// Scenes are plain data + small functions: a speed profile for "your" car, scenery, and actors
// whose position is a function of time. They are rendered in pseudo-3D on a <canvas>, so new clips
// can be contributed as code (no licensed video needed). Real CC-licensed dashcam video is also
// supported via { type: 'video', src, hazards }.

const W = 960, H = 540, HORIZON = 230, F = 600, CAM_H = 1.25;
const ROAD = 4.2; // half-width of the main road in metres
const CAM_X = -1.4; // UK: we drive on the left, centre line at x = 0

// ---------- maths helpers ----------
const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = k => Math.max(0, Math.min(1, k));
const ease = k => { k = clamp01(k); return k * k * (3 - 2 * k); };
// Interpolate between [t, value] keyframes.
export function track(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1], [t1, v1] = keys[i];
      return lerp(v0, v1, ease((t - t0) / (t1 - t0)));
    }
  }
  return keys[keys.length - 1][1];
}
// Distance travelled from a piecewise-linear speed profile [[t, m/s], ...].
function distance(profile, t) {
  let s = 0;
  for (let i = 1; i < profile.length; i++) {
    const [t0, v0] = profile[i - 1], [t1, v1] = profile[i];
    if (t <= t0) break;
    const te = Math.min(t, t1), ve = v0 + (v1 - v0) * ((te - t0) / (t1 - t0));
    s += (v0 + ve) / 2 * (te - t0);
  }
  const [tl, vl] = profile[profile.length - 1];
  if (t > tl) s += vl * (t - tl);
  return s;
}

// ---------- scoring (DVSA rules) ----------
// Each developing hazard has a scoring window split into 5 equal bands: 5,4,3,2,1 points.
// Only your first click in the window counts. Clicking continuously or in a pattern scores 0 for the clip.
export function detectCheating(clicks) {
  if (clicks.length >= 12) return 'Too many clicks in one clip';
  for (let i = 0; i + 4 < clicks.length; i++) {
    if (clicks[i + 4] - clicks[i] < 3) return 'Five or more clicks within 3 seconds';
  }
  if (clicks.length >= 5) {
    const gaps = clicks.slice(1).map((c, i) => c - clicks[i]);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length);
    if (sd < 0.25) return 'Clicks were evenly spaced, like a rhythm';
  }
  return null;
}
export function scoreClip(scene, clicks) {
  const cheat = detectCheating(clicks);
  const hazards = scene.hazards.map(h => {
    const band = (h.end - h.start) / 5;
    const hit = clicks.find(c => c >= h.start && c <= h.end);
    const points = cheat || hit === undefined ? 0 : 5 - Math.min(4, Math.floor((hit - h.start) / band));
    return { ...h, hit, points };
  });
  return { cheat, hazards, score: hazards.reduce((s, h) => s + h.points, 0), max: hazards.length * 5 };
}

// ---------- scenes ----------
const C = { red: '#b3261e', blue: '#2d5aa0', silver: '#a7adb5', white: '#e9ecef', black: '#262a2e', green: '#2f6f4f', yellow: '#d9a520', van: '#f1f3f5' };

function parkedRow(fromZ, toZ, x, gapEvery, palette) {
  const out = [];
  let i = 0;
  for (let z = fromZ; z < toZ; z += 6.2) {
    if (gapEvery && i % gapEvery === gapEvery - 1) { i++; continue; }
    out.push({ kind: 'car', x, z, color: palette[i % palette.length] });
    i++;
  }
  return out;
}

export const SCENES = [
  {
    id: 'residential-ball',
    title: 'Residential street',
    blurb: 'A quiet street lined with parked cars, around school time.',
    duration: 22,
    speed: [[0, 12], [11, 12], [15, 0], [17.5, 0], [22, 9]],
    sky: ['#9cc7ea', '#e3eef7'],
    houses: { left: true, right: true, seed: 3 },
    parked: [
      ...parkedRow(40, 160, -3.4, 0, [C.silver, C.blue, C.white, C.red, C.black]),
      ...parkedRow(170, 260, -3.4, 0, [C.green, C.silver, C.white]),
    ],
    actors: [
      // Adult walking on the far pavement: a potential hazard, not a developing one.
      { kind: 'adult', color: '#5b4a8a', at: t => ({ x: 5.6, z: 120 - 0.9 * t }) },
      { kind: 'ball', color: '#e8590c', at: t => t < 9 ? null : { x: track([[9, -3.6], [11.5, 1.2], [14, 4.0]], t), z: 165, y: Math.abs(Math.sin((t - 9) * 5)) * 0.35 } },
      { kind: 'child', color: '#c92a2a', hazard: 0, at: t => t < 10.2 ? null : { x: track([[10.2, -3.7], [12.2, -1.4], [16.5, -0.6], [18.5, 5.2]], t), z: 166.5 } },
    ],
    hazards: [{ start: 9.0, end: 14.0, label: 'Ball rolls out, then a child runs after it' }],
    debrief: 'The ball rolling out from between parked cars was the clue that a child might follow. The earliest score comes from reacting to the ball, not waiting until the child is in the road. The adult on the far pavement was only a potential hazard: they never made you change speed or direction.',
  },
  {
    id: 'side-road-emerge',
    title: 'Car at a side road',
    blurb: 'A 30 mph road with a junction on the left.',
    duration: 22,
    speed: [[0, 13], [13.3, 13], [16, 3], [17.5, 3], [22, 8]],
    sky: ['#b8c4cf', '#e9edf1'],
    houses: { left: true, right: true, seed: 7 },
    sideRoads: [{ z: 200, width: 9, side: 'left' }],
    parked: [
      ...parkedRow(60, 130, 3.4, 3, [C.white, C.red, C.silver]),
      { kind: 'van', x: 3.3, z: 150, color: C.van },
    ],
    actors: [
      { kind: 'car', color: C.yellow, oncoming: true, at: t => ({ x: 1.75, z: 330 - 14 * t }) },
      {
        kind: 'car', color: C.blue, hazard: 0, at: t => {
          if (t < 14.6) return { kind: 'car-side', x: track([[0, -10.5], [11, -10.5], [14.6, -1.4]], t), z: 204.5, facing: 1 };
          return { kind: 'car', x: -1.4, z: 204.5 + track([[14.6, 0], [22, 50]], t) };
        },
      },
    ],
    hazards: [{ start: 11.0, end: 15.5, label: 'Car edges out of the side road' }],
    debrief: 'The car waiting at the junction was a potential hazard as soon as you saw it. It became a developing hazard when it started to move forward. Drivers sometimes misjudge your speed, especially if parked vehicles hide you.',
  },
  {
    id: 'cyclist-van',
    title: 'Cyclist and parked van',
    blurb: 'Following a cyclist on a residential road with oncoming traffic.',
    duration: 20,
    speed: [[0, 11], [9, 11], [12, 5], [20, 5]],
    sky: ['#a5c8e4', '#eef4f9'],
    houses: { left: true, right: true, seed: 11 },
    parked: [{ kind: 'van', x: -3.3, z: 170, color: C.van }, { kind: 'car', x: -3.4, z: 230, color: C.red }],
    actors: [
      { kind: 'car', color: C.black, oncoming: true, at: t => ({ x: 1.75, z: 270 - 13 * t }) },
      { kind: 'car', color: C.white, oncoming: true, at: t => ({ x: 1.75, z: 370 - 12 * t }) },
      {
        kind: 'cyclist', color: '#1971c2', hazard: 0, at: t => {
          const z = 72 + 5 * t;
          return { x: track([[0, -3.2], [16, -3.2], [18, -1.2], [22, -1.2]], t), z };
        },
      },
    ],
    hazards: [{ start: 15.0, end: 19.5, label: 'Cyclist pulls out to pass the parked van' }],
    debrief: 'The parked van ahead of the cyclist meant they would have to move out into your lane. With oncoming traffic, you couldn\'t overtake, so the right response was to hang back and give them room.',
  },
];

// ---------- rendering ----------
function rng(seed) { let s = seed; return () => (s = (s * 9301 + 49297) % 233280) / 233280; }

function project(x, y, dz) {
  const k = F / dz;
  return [W / 2 + (x - CAM_X) * k, HORIZON + (CAM_H - y) * k, k];
}

function quad(ctx, pts, fill) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
}

// Ground strip between lateral x0..x1 and world z0..z1 (camera at s).
function strip(ctx, x0, x1, z0, z1, s, fill) {
  const d0 = Math.max(0.8, z0 - s), d1 = z1 - s;
  if (d1 <= 0.8) return;
  quad(ctx, [project(x0, 0, d0), project(x1, 0, d0), project(x1, 0, d1), project(x0, 0, d1)], fill);
}

function drawWorld(ctx, scene, s) {
  const far = s + 400;
  const g = ctx.createLinearGradient(0, 0, 0, HORIZON);
  g.addColorStop(0, scene.sky[0]); g.addColorStop(1, scene.sky[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, HORIZON + 1);
  ctx.fillStyle = '#6f8f5a'; ctx.fillRect(0, HORIZON, W, H - HORIZON);

  // Pavements and road
  strip(ctx, -ROAD - 3, -ROAD, s, far, s, '#b9b6ae');
  strip(ctx, ROAD, ROAD + 3, s, far, s, '#b9b6ae');
  for (const r of scene.sideRoads || []) {
    const x0 = r.side === 'left' ? -60 : ROAD, x1 = r.side === 'left' ? -ROAD : 60;
    strip(ctx, x0, x1, r.z, r.z + r.width, s, '#55585c');
    // give-way lines at the mouth of the junction
    for (let z = r.z + 0.4; z < r.z + r.width / 2; z += 0.9) strip(ctx, -ROAD - 0.4, -ROAD - 0.1, z, z + 0.5, s, '#f1f1f1');
  }
  strip(ctx, -ROAD, ROAD, s, far, s, '#55585c');
  // Kerb edge lines and centre dashes
  strip(ctx, -ROAD + 0.05, -ROAD + 0.2, s, far, s, '#d8d8d8');
  strip(ctx, ROAD - 0.2, ROAD - 0.05, s, far, s, '#d8d8d8');
  const start = Math.floor(s / 12) * 12;
  for (let z = start; z < far; z += 12) strip(ctx, -0.08, 0.08, z, z + 4, s, '#f4f4f4');

  // Houses: walls parallel to the road, far to near
  if (scene.houses) {
    const r = rng(scene.houses.seed);
    const blocks = [];
    for (let z = -40, i = 0; z < 700; i++) {
      const len = 9 + r() * 7, h = 5 + r() * 3.5;
      const hue = ['#a4593f', '#c4a484', '#8d6e63', '#bfae9e', '#9e5a48', '#d7ccc8'][Math.floor(r() * 6)];
      blocks.push({ z0: z, z1: z + len, h, hue, side: i % 2 });
      z += len + 2 + r() * 3;
    }
    for (const side of [-1, 1]) {
      if (side < 0 && !scene.houses.left) continue;
      if (side > 0 && !scene.houses.right) continue;
      const x = side * (ROAD + 6);
      for (const b of blocks.slice().reverse()) {
        if (b.z1 < s + 1 || b.z0 > far) continue;
        if ((scene.sideRoads || []).some(rd => side < 0 && b.z1 > rd.z - 2 && b.z0 < rd.z + rd.width + 2)) continue;
        const d0 = Math.max(1, b.z0 - s), d1 = b.z1 - s;
        quad(ctx, [project(x, 0, d0), project(x, 0, d1), project(x, b.h, d1), project(x, b.h, d0)], b.hue);
        quad(ctx, [project(x, b.h, d0), project(x, b.h, d1), project(x + side * 3, b.h + 2.4, d1), project(x + side * 3, b.h + 2.4, d0)], '#5c4b45');
        // windows
        for (let wz = b.z0 + 1.5; wz < b.z1 - 1.5; wz += 3) {
          const a = Math.max(1, wz - s), c = wz + 1.2 - s;
          if (c <= 1) continue;
          for (const wy of [1.3, 3.6]) {
            if (wy + 1.2 > b.h) continue;
            quad(ctx, [project(x - side * 0.01, wy, a), project(x - side * 0.01, wy, c), project(x - side * 0.01, wy + 1.2, c), project(x - side * 0.01, wy + 1.2, a)], '#2f3d4a');
          }
        }
      }
    }
  }
}

// Billboard sprites. (px, py) = ground point under the object's centre, k = pixels per metre.
function drawSprite(ctx, o, px, py, k) {
  ctx.save();
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(px + x * k, py - (y + h) * k, w * k, h * k); };
  switch (o.kind) {
    case 'car': case 'van': {
      const w = o.kind === 'van' ? 2.0 : 1.8, h = o.kind === 'van' ? 2.4 : 1.45;
      R(-w / 2, 0.25, w, h - 0.25, o.color);
      if (o.kind === 'car') R(-w / 2 + 0.18, 0.95, w - 0.36, 0.42, o.oncoming ? '#4b5a68' : '#1f2933');
      else R(-w / 2 + 0.1, 0.5, w - 0.2, 0.05, '#ccc');
      const light = o.oncoming ? '#fff6d5' : '#e03131';
      R(-w / 2 + 0.08, 0.62, 0.3, 0.16, light); R(w / 2 - 0.38, 0.62, 0.3, 0.16, light);
      R(-w / 2 + 0.1, 0, 0.38, 0.32, '#111'); R(w / 2 - 0.48, 0, 0.38, 0.32, '#111');
      break;
    }
    case 'car-side': {
      const len = 4.2, dir = o.facing || 1;
      R(-len / 2, 0.3, len, 0.75, o.color);
      ctx.fillStyle = o.color; ctx.beginPath();
      ctx.moveTo(px + (-len / 2 + 0.9) * k, py - 1.05 * k); ctx.lineTo(px + (-len / 2 + 1.4) * k, py - 1.5 * k);
      ctx.lineTo(px + (len / 2 - 1.3) * k, py - 1.5 * k); ctx.lineTo(px + (len / 2 - 0.7) * k, py - 1.05 * k); ctx.fill();
      R(-len / 2 + 1.5, 1.08, len - 3, 0.36, '#1f2933');
      for (const wx of [-len / 2 + 0.85, len / 2 - 0.85]) {
        ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(px + wx * k, py - 0.32 * k, 0.32 * k, 0, 7); ctx.fill();
      }
      R(dir > 0 ? len / 2 - 0.15 : -len / 2, 0.6, 0.15, 0.15, '#fff6d5');
      break;
    }
    case 'adult': case 'child': {
      const h = o.kind === 'child' ? 1.15 : 1.72, w = h * 0.26;
      R(-w / 2, 0, w * 0.42, h * 0.45, '#343a40'); R(w * 0.08, 0, w * 0.42, h * 0.45, '#343a40');
      R(-w / 2, h * 0.45, w, h * 0.38, o.color);
      ctx.fillStyle = '#e0b48a'; ctx.beginPath(); ctx.arc(px, py - h * 0.9 * k, h * 0.085 * k, 0, 7); ctx.fill();
      break;
    }
    case 'ball': {
      ctx.fillStyle = o.color; ctx.beginPath(); ctx.arc(px, py - (0.15 + (o.y || 0)) * k, 0.15 * k, 0, 7); ctx.fill();
      break;
    }
    case 'cyclist': {
      R(-0.03, 0, 0.06, 0.66, '#111');
      R(-0.22, 0.75, 0.44, 0.65, o.color);
      R(-0.12, 0.3, 0.1, 0.48, '#343a40'); R(0.02, 0.3, 0.1, 0.48, '#343a40');
      ctx.fillStyle = '#f8f9fa'; ctx.beginPath(); ctx.arc(px, py - 1.55 * k, 0.13 * k, 0, 7); ctx.fill();
      R(-0.05, 0.42, 0.1, 0.08, '#e03131');
      break;
    }
  }
  ctx.restore();
}

function drawFrame(ctx, scene, t, opts = {}) {
  const s = distance(scene.speed, t);
  drawWorld(ctx, scene, s);
  const items = [];
  for (const p of scene.parked || []) items.push({ ...p });
  for (const a of scene.actors || []) {
    const pos = a.at(t);
    if (pos) items.push({ ...a, ...pos, kind: pos.kind || a.kind });
  }
  items.sort((a, b) => b.z - a.z);
  for (const o of items) {
    const dz = o.z - s;
    if (dz < 1.2 || dz > 380) continue;
    const [px, py, k] = project(o.x, 0, dz);
    if (px < -400 || px > W + 400) continue;
    drawSprite(ctx, o, px, py, k);
    if (opts.highlight && o.hazard !== undefined) {
      const h = scene.hazards[o.hazard];
      if (t >= h.start && t <= h.end) {
        ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(px, py - 0.8 * k, Math.max(18, 1.6 * k), 0, 7); ctx.stroke();
      }
    }
  }
  // Dashboard edge + speed readout, like a camera mounted inside the car
  ctx.fillStyle = '#16191c'; ctx.beginPath();
  ctx.moveTo(0, H); ctx.lineTo(0, H - 34); ctx.quadraticCurveTo(W / 2, H - 70, W, H - 34); ctx.lineTo(W, H); ctx.fill();
  const mph = Math.round(track(scene.speed, t) * 2.237);
  ctx.fillStyle = '#e9ecef'; ctx.font = '600 15px system-ui, sans-serif'; ctx.textAlign = 'right';
  ctx.fillText(`${mph} mph`, W - 18, H - 14);
}

// Plays a clip. Calls onClick(t) for each flag, resolves with the click times when the clip ends.
export function playClip(canvas, scene, { highlight = false, onTick, signal } = {}) {
  const ctx = canvas.getContext('2d');
  canvas.width = W; canvas.height = H;
  const clicks = [];
  const flag = () => { if (t0 !== null) { const t = (performance.now() - t0) / 1000; if (t <= scene.duration) clicks.push(t); onTick?.(t, clicks); } };
  let t0 = null;
  return new Promise(resolve => {
    const key = e => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); flag(); } };
    if (!highlight) { canvas.addEventListener('pointerdown', flag); window.addEventListener('keydown', key); }
    const cleanup = () => { canvas.removeEventListener('pointerdown', flag); window.removeEventListener('keydown', key); };
    signal?.addEventListener('abort', () => { cleanup(); resolve(null); });
    const frame = now => {
      if (signal?.aborted) return;
      if (t0 === null) t0 = now;
      const t = (now - t0) / 1000;
      drawFrame(ctx, scene, Math.min(t, scene.duration), { highlight });
      onTick?.(t, clicks);
      if (t < scene.duration) requestAnimationFrame(frame);
      else { cleanup(); resolve(clicks); }
    };
    requestAnimationFrame(frame);
  });
}

export function drawPoster(canvas, scene, t = 1) {
  canvas.width = W; canvas.height = H;
  drawFrame(canvas.getContext('2d'), scene, t);
}

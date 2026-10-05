// Validates the question bank. Run: node scripts/validate.mjs
// Used in CI so every contribution is checked before it's merged.
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const { questions } = JSON.parse(readFileSync(new URL('data/questions.json', root)));
const { topics, sections } = JSON.parse(readFileSync(new URL('data/topics.json', root)));
const topicIds = new Set(topics.map(t => t.id));
const errors = [], seenIds = new Set(), seenText = new Map();

for (const [i, q] of questions.entries()) {
  const where = `#${i} (${q.id ?? 'no id'})`;
  const err = msg => errors.push(`${where}: ${msg}`);
  if (!/^[a-z]+-\d{3}$/.test(q.id ?? '')) err('id must look like "abc-001"');
  if (seenIds.has(q.id)) err('duplicate id');
  seenIds.add(q.id);
  if (!topicIds.has(q.topic)) err(`unknown topic "${q.topic}"`);
  if (typeof q.q !== 'string' || q.q.length < 10) err('question text missing or too short');
  const norm = q.q?.toLowerCase().replace(/\W+/g, ' ').trim();
  if (norm && !q.image && seenText.has(norm)) err(`same wording as ${seenText.get(norm)}`);
  seenText.set(norm, q.id);
  if (!Array.isArray(q.options) || q.options.length !== 4) err('needs exactly 4 options');
  else if (new Set(q.options.map(o => o.trim().toLowerCase())).size !== 4) err('options must be different');
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) err('answer must be an option index 0-3');
  if (typeof q.explain !== 'string' || q.explain.length < 20) err('explanation missing or too short');
  if (!q.ref || !sections[q.ref.section] || !q.ref.rule) err('ref needs a known section and a rule');
  if (q.image && !existsSync(new URL(q.image, root))) err(`image not found: ${q.image}`);
  if (q.image && !q.imageAlt) err('images need imageAlt text for screen readers');
}

for (const t of topics) {
  const n = questions.filter(q => q.topic === t.id).length;
  if (n < 3) errors.push(`topic "${t.id}" has only ${n} questions (minimum 3)`);
}

// Videos: well-formed IDs, known groups/topics, and links to questions that exist.
const { videos, groups } = JSON.parse(readFileSync(new URL('data/videos.json', root)));
const groupIds = new Set(groups.map(g => g.id)), videoIds = new Set();
for (const v of videos) {
  const err = msg => errors.push(`video ${v.id}: ${msg}`);
  if (!/^[\w-]{11}$/.test(v.id)) err('id must be an 11-character YouTube video id');
  if (videoIds.has(v.id)) err('duplicate video');
  videoIds.add(v.id);
  if (!groupIds.has(v.group)) err(`unknown group "${v.group}"`);
  if (!v.title || !v.channel || !v.blurb) err('needs title, channel and blurb');
  for (const t of v.topics || []) if (!topicIds.has(t)) err(`unknown topic "${t}"`);
  for (const id of v.questions || []) if (!seenIds.has(id)) err(`links to unknown question "${id}"`);
}

if (errors.length) {
  console.error(`✗ ${errors.length} problem(s):\n  ` + errors.join('\n  '));
  process.exit(1);
}
console.log(`✓ ${questions.length} questions across ${topics.length} topics and ${videos.length} videos look good`);

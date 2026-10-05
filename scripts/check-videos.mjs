// Checks every video is still online, embeddable, and uploaded by the channel we expect.
// Uses YouTube's public oEmbed endpoint (no API key). Run: node scripts/check-videos.mjs
import { readFileSync } from 'node:fs';

const { videos } = JSON.parse(readFileSync(new URL('../data/videos.json', import.meta.url)));
let failed = 0;
for (const v of videos) {
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + v.id)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} (removed, private or embedding disabled)`);
    const { author_name } = await res.json();
    if (author_name !== v.channel) throw new Error(`uploader is "${author_name}", expected "${v.channel}"`);
    console.log(`✓ ${v.id}  ${v.channel}`);
  } catch (e) {
    failed++;
    console.error(`✗ ${v.id}  ${v.title}: ${e.message}`);
  }
}
if (failed) { console.error(`\n${failed} video(s) need attention`); process.exit(1); }
console.log(`\nAll ${videos.length} videos OK`);

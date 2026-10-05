# Contributing to Clearway

Thank you! Every contribution helps more learner drivers prepare for their test.

## ⚖️ The one rule: content must be original

- ✅ Write questions **in your own words**, based on The Highway Code (OGL v3.0) or other GOV.UK guidance published under OGL.
- ❌ Don't copy or paraphrase closely from the **DVSA official revision question bank**, the **official hazard perception clips**, books, or any other app or website. These are copyrighted and licensed commercially, and copying them could get the whole project taken down.
- ❌ Don't upload video you don't own. Dashcam footage is welcome only if you recorded it yourself and blur faces and number plates.

By contributing you agree to release your work under MIT (code) or CC BY-SA 4.0 (questions and scenes).

## Adding a question

Add an object to `data/questions.json`:

```json
{
  "id": "mar-010",
  "topic": "safety-margins",
  "q": "Clear, single-idea question?",
  "options": ["Correct answer", "Plausible wrong answer", "Plausible wrong answer", "Plausible wrong answer"],
  "answer": 0,
  "explain": "Why the answer is right, in plain English, ideally saying why the tempting wrong answer is wrong.",
  "ref": { "section": "general", "rule": "126" }
}
```

- `answer` is the index of the correct option. Options are shuffled when shown, so it's fine to put the correct one first.
- `ref.section` must be a key in `data/topics.json → sections`; `ref.rule` is the rule number (or e.g. "Annex 7").
- Sign questions can add `"image": "img/signs/x.svg"` and **must** add `"imageAlt"`.
- Write in plain English: short sentences, no trick questions, and avoid "always" or "never" unless the rule says so.
- Run `node scripts/validate.mjs` before you open a pull request.

**Every content pull request needs a reviewer to check the cited rule on GOV.UK.** Accuracy matters more than volume.

## Suggesting a video

Videos are embedded from YouTube, so we never host or copy them. Add an entry to `data/videos.json`:

```json
{ "id": "11-char-id", "channel": "Exact YouTube channel name", "group": "motorway",
  "title": "Short title", "blurb": "One sentence on what it covers.",
  "topics": ["motorway"], "questions": ["mwy-002"] }
```

Rules:
- **Only videos uploaded by the organisation that made them**: DVSA, National Highways, THINK!/DfT, police forces, or road-safety charities (Brake, IAM RoadSmart, RoSPA, etc.). No re-uploads of DVSA clips, and no channels selling courses.
- Embedding must be enabled. `channel` must match the uploader exactly, because `node scripts/check-videos.mjs` checks it.
- Watch the whole video and make sure it matches the current Highway Code. Older videos can be out of date (for example, from before the 2022 changes).
- `questions` (optional) shows the video under those questions' explanations.

## Writing a hazard perception scene

Scenes live in `js/hazard.js → SCENES`. A scene describes:

- `speed`: the camera car's speed profile, as `[time s, metres/s]` keyframes (13.4 m/s ≈ 30 mph)
- `parked`: static objects `{ kind, x, z }`. `x` is metres from the centre line (negative is left, our lane is about −1.4) and `z` is metres along the road
- `actors`: `{ kind, at: t => ({ x, z }) | null }`. Use `track(keyframes, t)` for smooth movement, and mark the developing hazard's actor with `hazard: 0`
- `hazards`: `[{ start, end, label }]`. The scoring window opens when the hazard **starts to develop** (not when the object first appears) and is split into 5 bands
- `debrief`: teach the learner what the early clue was

Kinds available: `car`, `car-side`, `van`, `adult`, `child`, `ball`, `cyclist`. New kinds go in `drawSprite`.

Calibrate your window by asking a few people to play the clip. If most experienced drivers react before `start`, move it earlier.

### Real video clips
The engine is designed to also support `{ type: 'video', src, hazards }` for **self-recorded, CC-licensed** footage. Please open an issue first so we can agree on hosting and anonymisation.

## Code
No framework and no build step, on purpose: anyone can open the files and contribute. Keep it that way unless there's a strong reason.

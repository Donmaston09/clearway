# Clearway: free UK driving theory practice

**No paywalls. No adverts. No account. Open source.**

Clearway helps learner drivers prepare for the UK car theory test. Every question is written from scratch, is based on The Highway Code, and links to the exact rule it tests, so you learn *why* as well as *what*.

## What's different

| | Typical theory apps | Clearway |
|---|---|---|
| Price | Free tier, then subscription | Free forever |
| Sources | Answers with no reference | Every answer links to the Highway Code rule |
| Learning method | Random quizzes | Spaced repetition: mistakes come back at 10 min, 1, 3, 7 and 21 days |
| Hazard perception | Licensed video, paid | Open, code-defined scenes anyone can write, scored like the real test |
| Privacy | Accounts, tracking | Nothing leaves your device. Progress can be exported as JSON |
| Offline | Varies | Installable PWA, works with no signal |
| Videos | Links out, or re-uploads of copyrighted clips | Official videos only, embedded in the app, checked weekly |
| Accessibility | Varies | Read-aloud, keyboard play (1–4, Enter, Space), dark mode, screen-reader labels |

### Features
- **Smart review**: Leitner-style spaced repetition that focuses on what you get wrong
- **Practice by topic**: all 14 DVSA topic areas, with mastery tracking
- **Mock test**: 50 questions, 57 minutes, pass mark 43, flagging and a question navigator
- **Hazard perception**: interactive clips with 5-4-3-2-1 scoring windows, anti-pattern-click detection, a timeline debrief, and replay with the hazard highlighted
- **Watch & learn**: official videos from DVSA, National Highways, THINK! and road-safety charities, playing inside the app. Related videos also appear under the questions they explain
- **Readiness score**: combines topic mastery with recent mock results
- **Report a problem** link on every question

## Run it locally

It's a static site with no build step and no dependencies. Any static server works:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. (Opening `index.html` directly won't work, because browsers block ES modules on `file://`.)

## Deploy for free
Push to GitHub and turn on **GitHub Pages** (Settings → Pages → deploy from branch). Netlify, Cloudflare Pages and Vercel also work with zero configuration. If you fork the project, update `REPO` at the top of `js/app.js` to your repository URL.

## Project layout
```
data/questions.json   question bank (CC BY-SA 4.0)
data/topics.json      14 DVSA topics + Highway Code section links
data/videos.json      curated official YouTube videos
js/app.js             UI and routing (vanilla JS, no framework)
js/store.js           progress + spaced repetition (localStorage)
js/hazard.js          hazard perception engine, scenes and scoring
img/signs/            traffic sign SVGs, drawn from scratch
scripts/validate.mjs  content checks, run in CI
sw.js                 offline support
```

## Validate content
```bash
node scripts/validate.mjs
```

Check that every video is still online and uploaded by the expected channel (this also runs weekly in GitHub Actions):
```bash
node scripts/check-videos.mjs
```

## Roadmap
- [ ] Grow the bank to 700+ reviewed questions across all topics
- [ ] Video case-study questions (3 questions about a clip, as in the real test)
- [ ] 14-clip hazard perception mock with 15 hazards (pass 44/75)
- [ ] More scene types: roundabouts, motorways, night, rain, rural roads
- [ ] Welsh language (the real test is offered in English and Welsh), plus community translations
- [ ] Motorcycle, LGV and PCV question sets
- [ ] Optional sync between devices, without accounts (e.g. a passphrase-encrypted export)

## Legal
Code: MIT. Questions and scenes: CC BY-SA 4.0. Contains public sector information from The Highway Code, licensed under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).

Clearway is **not** affiliated with or endorsed by DVSA. It doesn't contain the DVSA revision question bank or official hazard perception clips, which are licensed separately. Always check current rules on GOV.UK, and book tests only at https://www.gov.uk/book-theory-test.

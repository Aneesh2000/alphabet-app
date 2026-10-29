---
name: abc-owl
description: Work on the ABC Owl alphabet-learning PWA in this repo — run it locally, test it (engine simulation + headless-browser e2e), change letters/words/sounds/stickers or game rules, ship a release (bump service-worker VERSION, commit, push to GitHub Pages). Use for any change to this app or when asked to run, test, or deploy it.
---

# ABC Owl

Static, offline-capable PWA (vanilla JS, no build, no dependencies) that teaches young children letters. Live at https://aneesh2000.github.io/alphabet-app/ (GitHub Pages from `main`, repo `Aneesh2000/alphabet-app`). Full design and behavior are in `IMPLEMENTATION.md` — read the relevant section before changing logic.

## Map

| File | Owns |
|---|---|
| `js/data.js` | Letters (`upper, lower, sound, word, emoji, say?, audio?, position?`), look-alike maps, phonics order, stickers |
| `js/engine.js` | Adaptive logic, pure/no DOM: pool, weights, distractors, mastery, levels. Tunables in `CFG` and `LEVELS` |
| `js/speech.js` | TTS voice choice, cancellable queue, recorded-audio override |
| `js/app.js` | Only file touching the DOM: screens, question flow, timings (constants at top), grown-ups panel |
| `js/storage.js` | `localStorage["abc-owl"]` schema + `VERSION`/`migrate()` |
| `js/rewards.js`, `js/sfx.js` | Stars/sparkles/stickers; Web Audio sound effects |
| `sw.js` | Cache-first service worker; `VERSION` + `ASSETS` list |

Scripts are classic `<script>` tags on `window.ABC` (not ES modules, so `file://` works). Keep that pattern; add new scripts to `index.html` in dependency order **and** to `ASSETS` in `sw.js`.

## Run

```bash
cd alphabet-app && python3 -m http.server 8765    # http://localhost:8765/
```
Service worker / offline only works on http(s), not `file://`. Phones need the HTTPS Pages URL to install offline.

## Test (run both after any logic or UI change)

```bash
node tests/engine-sim.js        # simulated learners; expect immediateRepeats=0 badChoices=0,
                                # guessing toddler stays ~level 1, one-session learner mastered=0
```

Browser e2e needs `puppeteer-core` (not committed — install outside the repo) and Google Chrome:
```bash
mkdir -p /tmp/abc-e2e && (cd /tmp/abc-e2e && npm i puppeteer-core@23 --silent)
python3 -m http.server 8765 &                          # from alphabet-app/
NODE_PATH=/tmp/abc-e2e/node_modules node tests/e2e.js http://localhost:8765/ /tmp/abc-e2e
# or against the live site: node tests/e2e.js https://aneesh2000.github.io/alphabet-app/
```
Pass = `ERRORS: none`, `end screen: true`, `offline reload ok`. Screenshots land in the given dir — look at them for layout changes. The test fakes TTS and parses prompts with `/Find the (small )?letter (\w+)!/`; update that regex if prompt wording changes.

Gotchas the e2e test hits on purpose: input is locked while the prompt speaks + 300 ms cooldown, and the sticker overlay ignores taps for 800 ms — wait before clicking.

## Common changes

- **Words / emoji / sounds:** edit the letter in `data.js`. Prefer old, widely supported emoji (new ones render as tofu on older phones). The word's first letter must make the taught sound (short vowels: apple, egg…); use `position: 'end'` for "ends with" words like Fox.
- **Pronunciation:** phrases always say "the letter A" (uppercase, no comma) — that context makes voices say the letter name. Never speak a bare letter (reads as "uh") or spellings like "ay" (reads as "eye"). Use `say` only for accent-specific names (Z → zee/zed).
- **Recorded audio:** put `audio/x.mp3`, set `audio: 'audio/x.mp3'` on the letter, add the path to `ASSETS`.
- **Difficulty / pacing:** change numbers in `Engine.CFG`, `LEVELS`, or the constants at the top of `app.js`; re-run `engine-sim.js`.
- **Stored data shape:** bump `VERSION` in `storage.js` and extend `migrate()` so existing players don't lose progress.
- **Every file listed in `ASSETS` must exist** or the service worker install fails and offline breaks.

## Ship a release

1. Run both tests.
2. **Bump `VERSION` in `sw.js`** (`abc-owl-vN` → `vN+1`). Without this, installed devices keep serving old files.
3. Update `IMPLEMENTATION.md` if behavior changed.
4. Commit and push `main` (ask the user first). Pages redeploys in ~1 min; verify with `node tests/e2e.js https://aneesh2000.github.io/alphabet-app/`.

GitHub CLI is installed at `~/.local/bin/gh` (may not be on PATH): e.g. `~/.local/bin/gh api repos/Aneesh2000/alphabet-app/pages --jq .status`.

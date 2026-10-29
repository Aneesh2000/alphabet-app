# ABC Owl — Implementation Guide

A letter-learning game for young children. The app speaks a letter ("Find the letter A!"), the child taps it from 2–4 big tiles, and a correct answer shows an example ("A says ah, as in 🍎 Apple") before the Next button appears. A wrong answer gets a gentle retry. Difficulty adapts to the child.

- **Type:** static Progressive Web App (HTML/CSS/vanilla JS). No backend, no build step, no dependencies.
- **Targets:** phones and tablets (touch first), also works on desktop. Works offline after the first visit.
- **Privacy:** all data stays in the browser's `localStorage`. No network calls, analytics, or ads.

---

## 1. Running it

| Goal | How |
|---|---|
| Quick look | Open `index.html` in a browser. Everything works except offline caching, because service workers don't run on `file://`. |
| Local dev with offline | `cd alphabet-app && python3 -m http.server 8000`, then open `http://localhost:8000` |
| Test on a phone | Deploy to any static HTTPS host (GitHub Pages, Netlify, Vercel, Cloudflare Pages). Service workers need **HTTPS**; plain `http://<laptop-ip>` on a phone will run the game but won't work offline. |
| Install as an app | In the phone browser: Share → *Add to Home Screen* (iOS) or menu → *Install app* (Android). |
| Engine simulation | `node tests/engine-sim.js` |

---

## 2. Feature checklist

| Feature | Where |
|---|---|
| Start screen, 1–4 local player avatars, first tap unlocks audio | `app.js` → `renderProfiles`, `startProfile` |
| Spoken prompt with letter **name**; replay 🔊 button | `app.js` → `askPrompt`; `speech.js` |
| 2–4 letter tiles depending on level | `engine.js` → `buildChoices` |
| Wrong answer: wobble + "boop" + "Oops! Try again!" + prompt replayed; the tile is dimmed and can't be tapped again | `app.js` → `onWrong` |
| Hint: correct tile glows after the 2nd miss, when it's the only one left, or after 6 s idle | `app.js` → `onWrong`, `armIdleHint`, `showHint` |
| Correct answer: chime, confetti, star flies to counter, example emoji + word with the letter highlighted, spoken name + sound + word | `app.js` → `onCorrect`, `showExample` |
| Next ➜ button after praise ends (≥1.5 s); "Tap the arrow!" nudge at 3 s; auto-advance at 10 s | `app.js` → `showNext` |
| Rounds of 8 questions → "Great job!" screen (play again / sticker book / home) | `app.js` → `endRound` |
| Adaptive difficulty: 4 levels, rises and falls | `engine.js` → `updateLevel` |
| Spaced practice: weak letters more often, mastered letters reviewed sometimes, no immediate repeats | `engine.js` → `nextItem`, `weight` |
| Uppercase first; each lowercase letter unlocks when its uppercase is mastered | `engine.js` → `buildPool` |
| Look-alike letters (b/d, E/F…) avoided at level 1, used as distractors at levels 3–4 | `data.js` confusable maps, `engine.js` |
| Letter order: A–Z or phonics (S A T I P N…) | Grown-ups panel; `data.js` → `PHONICS_ORDER` |
| Voice accent en-US / en-GB / en-IN ("zee" vs "zed"), offline voices preferred | `speech.js` → `pickVoice`, `nameFor` |
| Recorded audio override per letter | `data.js` `audio` field; `speech.js` → `playFile` |
| Stars ⭐ (first try) and sparkles ✨ (after a miss/hint) | `rewards.js` |
| Stickers every 5 first-try stars (10 points), sticker book by theme | `rewards.js`, `app.js` → `showSticker`, `openStickers` |
| Owl mascot 🦉 that "talks" while audio plays | `app.js` → `talking` |
| Grown-ups panel behind a 3-second hold: order, accent, voice test, per-player summary, reset/delete | `app.js` → `setupParentGate`, `openParent` |
| Works without speech: bubble shows the letter + 🔇 icon | `app.js` → `setPromptBubble`, `soundWarning` |
| Offline + installable | `sw.js`, `manifest.json` |
| Kid-proofing: no zoom, no long-press menu, no text selection, multi-touch ignored, pause when app is hidden | `styles.css`, `app.js` |
| Early-reader font (Andika, single-story "a") bundled | `fonts/` |
| Reduced-motion support | `styles.css` media query |

---

## 3. Architecture

```
alphabet-app/
├── index.html          all screens as <section>s; only one has .active
├── manifest.json       PWA metadata (fullscreen, portrait, icons)
├── sw.js               cache-first service worker
├── css/styles.css      layout (vmin-based so it scales), animations
├── fonts/              Andika-Bold.ttf + OFL license
├── icons/              icon.svg, icon-192.png, icon-512.png
├── audio/              empty; drop recorded clips here
├── js/
│   ├── data.js         content: letters, words, emoji, confusables, orders, stickers
│   ├── storage.js      versioned localStorage + profiles
│   ├── engine.js       adaptive logic (pure, no DOM → testable in Node)
│   ├── speech.js       TTS wrapper + recorded-audio override
│   ├── sfx.js          chime / boop / fanfare synthesized with Web Audio
│   ├── rewards.js      stars, sparkles, stickers
│   └── app.js          controller: screens, question flow, UI effects, grown-ups panel
└── tests/engine-sim.js simulated learners against engine.js
```

**Module pattern:** classic `<script>` tags that attach to one global, `window.ABC`, loaded in dependency order. ES modules were avoided on purpose: they don't load from `file://`, and opening `index.html` directly is useful for parents and testers.

**Dependency direction:** `app.js` → (`engine`, `speech`, `sfx`, `rewards`, `storage`) → `data`. Only `app.js` touches the DOM.

---

## 4. Question flow and timing

```
nextQuestion()
  └─ Engine.nextItem → Engine.buildChoices → render tiles (input LOCKED)
     └─ askPrompt(): speak "Find the letter A!" → UNLOCK → start 6 s idle timer
          ├─ wrong tap  → dim + wobble + boop → LOCK → speak "Oops! Try again!" + prompt
          │                → glow answer if (2nd miss OR only answer left) → UNLOCK
          ├─ 6 s idle   → glow answer + repeat prompt
          └─ right tap  → record answer, award, save → chime/confetti/star → example
                           → speak praise → wait ≥1.5 s total → [sticker overlay?] → Next ➜
                                     → 3 s "Tap the arrow!" → 10 s auto-advance
after 8 answers → endRound()
```

| Constant (`app.js`) | Value | Purpose |
|---|---|---|
| `ROUND_LEN` | 8 | Questions before the "Great job!" break |
| `HINT_IDLE_MS` | 6000 | Idle time before the answer glows |
| `NEXT_MIN_MS` | 1500 | Minimum time the example stays before Next |
| `NEXT_NUDGE_MS` | 3000 | Spoken nudge to press Next |
| `AUTO_NEXT_MS` | 10000 | Auto-advance |
| `TAP_COOLDOWN_MS` | 300 | Ignore taps right after input unlocks |
| `HOLD_MS` | 3000 | Grown-ups gate hold |

**Stale-callback protection:** every question gets an incrementing `q.id`. Async callbacks (speech finished, timers) check `alive(id)`, which also returns false while the app is hidden. Leaving mid-question therefore never triggers actions on the wrong screen.

**Input rules**
- Tiles use `pointerdown` for instant response. Non-primary pointers (a second finger) are ignored.
- Other buttons use `click`, because **iOS only grants audio permission on click/touchend**, not on `pointerdown`.
- Input is locked while the prompt or "Oops" audio plays, plus a 300 ms cooldown. This replaces "fast-tap = spam" detection: a child can't answer before hearing the letter.

---

## 5. Adaptive engine (`engine.js`)

### Items
An *item* is a letter in one case: `{ letter, lower: bool, key: 'A' | 'a' }`. Stats are kept per key, so "A" and "a" are learned separately.

### Levels (`LEVELS`)
| Level | Choices | Distractors |
|---|---|---|
| 1 | 2 | Look-alikes **excluded** |
| 2 | 3 | Random |
| 3 | 3 | Always includes 1 look-alike if one exists |
| 4 | 4 | Always includes 1 look-alike if one exists |

- **Level up:** first-try correct in the last 8 answers ≥ 7 (level 1) or ≥ 6 (levels 2–3). A stricter bar at 2 choices because a guesser scores 50% there.
- **Level down:** fewer than 50% first-try correct over at least 6 answers. It happens silently; level up gets a spoken "Wow! You are getting so good!".
- The window resets after any level change.
- **Lowercase ease-in:** a lowercase item seen fewer than 3 times is asked at `level − 2` (minimum 1), so switching case isn't a sudden jump.

### Which letter next (`buildPool`, `nextItem`)
1. **Pool** = every item seen before + new items, added in letter order, until 3 items are "shaky" (not mastered and current streak < 2). Newly unlocked lowercase items are introduced before new uppercase ones.
2. **Weights:** new = 3; seen-not-mastered = 2 + (2 − streak), i.e. 4/3/2; mastered = 0.5 (occasional review).
3. The last 1–2 asked items are excluded, so there are no immediate repeats.
4. The very first question of a new player is always the first letter of the chosen order (A, or S in phonics order).

### Mastery (`recordAnswer`)
- **First try** = correct with no misses and no hint (glowing tile). Only first-try answers increase the streak.
- **Mastered** = streak ≥ 3 **and** first-try successes in ≥ 2 different sessions. A later miss removes mastery until the streak is rebuilt.
- **Session** = a new session starts after 1 hour without activity (`touchSession`).
- Mastering an uppercase letter unlocks its lowercase.

All thresholds are in `Engine.CFG` and `LEVELS`, so tuning means changing numbers, not logic.

### Simulation results (`node tests/engine-sim.js`)
Typical output (randomized):
```
strong 5yo (95%):        level=4  mastered=24  lowercase started=12 (6 sessions × 24 q)
guessing toddler (50%):  level=1  mastered≈1–3                        → guessing doesn't advance
average (75%) phonics:   first=S  level=4  mastered=13–18
one session only:        mastered=0, lowercase=0                      → 2-session rule holds
immediateRepeats=0  badChoices=0  (exactly one correct tile, no duplicates, case always consistent)
```

---

## 6. Speech (`speech.js`)

- **Voice choice:** among voices matching the language, the score favors exact accent (+4), `localService` (offline, +3), and system default (+0.5). Re-evaluated on `voiceschanged`, because voices load asynchronously.
- **Settings:** rate 0.8, pitch 1.1 (slower and friendlier).
- **Unlock:** `Speech.unlock()` speaks a silent utterance inside the first click, which iOS requires.
- **Queue:** `say([...parts])` cancels anything playing and speaks the parts in order. A `token` counter stops stale queues. Each utterance has a fallback timeout (`1.5 s + 110 ms × chars`) because some engines never fire `onend`.
- **Failure:** any synthesis error other than interrupted/canceled sets `broken`. The game then shows the target letter in the bubble ("Find: D") and a 🔇 icon, and keeps working as a visual matching game.
- **Letter names:** every phrase says "the letter A" / "the small letter A" (uppercase, no comma). Voices read that as the letter name; a bare "A" is read as "uh" and the spelling "ay" as "eye". The optional `say` field overrides the spoken name (used only for Z → "zee"/"zed" by accent). `sound` is a phonetic spelling ("buh", "sss"). **Tune these by ear on your target devices.**
- **Recorded audio:** set `audio: 'audio/a.mp3'` on a letter in `data.js` and add the path to `ASSETS` in `sw.js`. The clip replaces the TTS praise for that letter and falls back to TTS if it fails to load.

---

## 7. Rewards (`rewards.js`)
- First try: ⭐ +2 points. After a miss or hint: ✨ +1 point, so effort is still rewarded.
- Every 10 points (= 5 first-try stars) awards the next sticker from `ABC.STICKERS` (30 in 3 themes: Animals, Space, Food), in fixed order with no randomness.
- The topbar shows ⭐/✨ counts and a progress bar toward the next sticker. The sticker book shows earned stickers and "?" placeholders.

---

## 8. Data and storage (`storage.js`)

`localStorage["abc-owl"]`:
```js
{
  version: 1,
  settings: { order: 'az' | 'phonics', accent: 'en-US' | 'en-GB' | 'en-IN' },
  profiles: [{
    id, avatar: '🐼', level: 1..4, points, stars, sparkles, stickers: ['🦄', ...],
    items: { A: { seen, firstTry, streak, sessionsCorrect, lastCorrectSession, lastSeen, mastered } },
    recent: [1,0,1...],   // leveling window
    lastKeys: ['A','b'],  // repeat avoidance
    sessionNo, lastActive
  }]
}
```
- Saved after every answer and every settings or profile change.
- **Migration:** `migrate()` fills in missing fields. An unknown `version` resets to defaults rather than crashing. Bump `VERSION` and add a migration step when the schema changes.
- If `localStorage` is blocked (some private modes), the app runs from memory and the grown-ups panel shows a warning.
- `navigator.storage.persist()` is requested to reduce eviction (Safari can clear storage of non-installed sites after ~7 days unused). **Installing to the home screen is the reliable fix.**

---

## 9. Offline / PWA (`sw.js`)
- **Cache-first:** all app files are pre-cached on install. Any other same-origin GET (e.g. audio clips) is cached the first time it loads.
- **Updates:** change `VERSION` in `sw.js` whenever any file changes. The new worker activates immediately (`skipWaiting` + `clients.claim`), deletes old caches, and serves new files from the next launch. The child never sees an update prompt.
- **Every file in `ASSETS` must exist**, or install fails and nothing is cached.
- **Text-to-speech offline:** depends on the device having a local voice. The grown-ups panel shows the chosen voice and whether it works offline.

---

## 10. Grown-ups panel
Hold ⚙️ (top-right of the start screen) for 3 seconds. A progress bar fills while holding; letting go early cancels.
- Letter order, voice accent, 🔊 Test voice, and voice info ("works offline ✓" / "needs internet").
- Per player: level, ⭐, ✨, letters learned, stickers, with **Reset** and **Delete** (each confirmed).

---

## 11. Testing done

| Test | Result |
|---|---|
| `node --check` on all JS; manifest JSON parse | Pass |
| Engine simulation (4 learner types, ~600 questions): valid choice sets, no immediate repeats, leveling, mastery rules | Pass |
| Headless Chrome end-to-end (iPhone-size viewport, fake TTS): first-run play, wrong tap → wobble/dim/glow, correct → example + Next, full 8-question round, sticker overlay, end screen, sticker book, 3 s gate (short press rejected), reload keeps progress, service worker active, **offline reload works**, Andika font loads offline | Pass, 0 console errors |
| No-speech fallback in landscape: bubble shows letter, 🔇 shown | Pass |

**Not yet tested (do before release):** real iPhone/iPad Safari and Android Chrome (voices, audio unlock, installed PWA); listening to every `say`/`sound` string on target voices; a session with a real child.

---

## 12. Differences between the design and this implementation

| Area | Discussed design | Implementation | Why |
|---|---|---|---|
| Levels | 5 levels; case tied to level (levels 4–5 = lowercase) | 4 levels for choice count and distractors; **case decided per letter**; new lowercase letters start 2 levels easier | Matches the later recommendation to unlock lowercase per letter, without a global "case cliff" |
| Level-up rule | ≥80% over last 10 | ≥7/8 at level 1, ≥6/8 at levels 2–3; down if <50% over ≥6 | Stricter where guessing is easiest (2 choices) |
| Introducing letters | Not specified | "Shaky" concept (streak <2) controls when new letters enter | Mastery needs 2 sessions, so gating on mastery alone would keep a child on 3 letters for a whole first session |
| Hint rule | Glow after 2 misses (flawed with 3 tiles); revised to replay after 1 miss, glow after 2 or 6 s | Revised rule, **plus** glow as soon as only the answer is left; wrong tiles are dimmed and disabled | With 2 tiles, one miss already leaves just the answer |
| Spam-tap detection | Treat taps <400 ms after prompt as spam | Input **locked during the prompt** + 300 ms cooldown | Simpler, and the child must hear the letter first |
| Example words | Kite, Nest | **Key 🔑, Nose 👃** | 🪁 and 🪺 are recent emoji that show as empty boxes on older devices |
| Pictures | Open question: emoji vs bundled SVG pack | **Emoji** | Fastest option; swapping to SVGs is a data change (see §13) |
| Mascot | Open question | **Owl 🦉** | Default choice |
| Profiles | Open question | **1–4 local avatar profiles**, no names | Recommendation; keeps siblings' progress separate with no personal data |
| Accent | Open question | Grown-ups setting: US (default) / UK / India | Lets each family choose "zee"/"zed" |
| Letter order | Open question | A–Z default, phonics option | Recommendation |
| Hinted answers | Open question | ✨ sparkle worth 1 point vs ⭐ 2 points; counts toward stickers, not mastery | Recommendation (reward effort, not guessing) |
| Stickers | One themed set unlocked per 26-letter round | Sequential 30 stickers across 3 themes, one per 10 points; **stops at 30** | Simpler; more sets are a data addition |
| Next button | Appears after ~1.5 s | After praise finishes **and** ≥1.5 s; spoken nudge at 3 s; auto-advance at 10 s | Example is never cut off mid-sentence |
| Prompt text on screen | Spoken only | Bubble says "Find the letter… 👂" (letter hidden) when speech works; shows the letter when speech fails | Forces listening, but the app still works without audio |
| Mute detection | Show 🔇 if audio seems blocked | 🔇 only when speech synthesis reports an error | Browsers can't detect the iOS silent switch |
| Font | Andika or Lexend | **Andika bundled** (~680 KB) | Single-story "a" like early-reader books; works offline |
| Orientation | Portrait lock | Portrait in manifest **and** a landscape layout | iOS ignores manifest orientation |
| Data model | `{ letter, sound, word, emoji, audio, confusableWith }` | `{ upper, lower, say, sound, word, emoji, audio?, position? }`; look-alikes in separate per-case maps | Separate spoken spelling (`say`); "ends with" support for X; case-specific look-alikes (b/d only matter in lowercase) |
| Storage | Single progress object | `{ version, settings, profiles[] }` | Needed for multiple profiles |
| Extras | Grown-ups panel only for settings | Also a one-line summary per player (level, stars, letters learned) | Small aid for parents and testing; not the full progress page |
| Not built (were suggestions, not v1 scope) | Letter tracing, reverse mode (picture → letter), multiple words per letter, letter of the day, full parent progress grid, other alphabets, mic mode | — | Out of v1 scope; see §13 |
| Child testing | 5–10 min with a real child | Not done | Needs a real device and child |

---

## 13. Known limitations and next steps

**Known limitations**
- TTS phonics sounds ("ah", "kuh") vary by voice and some will sound off. Recorded clips for vowels, C, G, Q and X are the highest-value upgrade.
- Some emoji/word pairs are ambiguous to children: 🐛 *Insect* (they say "bug"), 👸 *Queen* (they say "princess"), ⚽ *Ball* ("soccer"). The word is always shown with its letter highlighted, but consider SVG illustrations.
- Once speech fails, the visual fallback stays on until the app reloads.
- The 6 s idle hint also triggers for slow-but-correct children, and that answer then doesn't count toward mastery.
- After 30 stickers no more are awarded.
- Progress lives on one device; clearing browser data erases it.

**Suggested next steps (in order)**
1. Test on real iOS and Android devices and tune `say`/`sound` strings by ear.
2. Record audio clips (start with vowels + C, G, Q, X) using the existing `audio` field.
3. Reverse mode (show 🍎 → "Which letter does apple start with?") as a new question type in `app.js`, reusing the engine.
4. 2–3 example words per letter (make `word`/`emoji` arrays and pick at random).
5. Parent progress grid (green/amber/red per letter) from `profile.items`.
6. Letter tracing on a `<canvas>` after a correct answer.
7. More sticker themes; optional SVG picture pack (OpenMoji, CC BY-SA).

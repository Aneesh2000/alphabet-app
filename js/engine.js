// Adaptive learning engine: which letter to ask, which distractors to show, mastery and levels.
// Pure logic, no DOM, so it can be unit-tested in Node.
window.ABC = window.ABC || {};

ABC.Engine = (function () {
  'use strict';

  const CFG = {
    windowSize: 8,                         // rolling window of first-try results
    levelUpNeeds: { 1: 7, 2: 6, 3: 6 },    // first-try correct out of last 8 to level up
    levelDownBelow: 0.5,                   // first-try rate that triggers a quiet level down
    minAnswersForDown: 6,
    masteryStreak: 3,                      // first-try correct in a row...
    masterySessions: 2,                    // ...with first-try successes in >= 2 sessions
    maxShaky: 3,                           // introduce new letters while fewer are still shaky
    sessionGapMs: 60 * 60 * 1000,          // 1h of inactivity starts a new session
    maxLevel: 4,
  };

  // Case is decided per letter (lowercase unlocks after uppercase mastery), not per level.
  const LEVELS = {
    1: { choices: 2, confusables: 'avoid' },
    2: { choices: 3, confusables: 'any' },
    3: { choices: 3, confusables: 'include' },
    4: { choices: 4, confusables: 'include' },
  };

  const byUpper = {};
  ABC.LETTERS.forEach((L) => { byUpper[L.upper] = L; });

  const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  const charOf = (item) => (item.lower ? item.letter.lower : item.letter.upper);
  const peek = (profile, key) => profile.items[key];

  function stat(profile, key) {
    return profile.items[key] || (profile.items[key] = {
      seen: 0, firstTry: 0, streak: 0, sessionsCorrect: 0,
      lastCorrectSession: -1, lastSeen: 0, mastered: false,
    });
  }

  function touchSession(profile, now = Date.now()) {
    if (now - (profile.lastActive || 0) > CFG.sessionGapMs) profile.sessionNo += 1;
    profile.lastActive = now;
  }

  function orderedLetters(order) {
    return order === 'phonics' ? ABC.PHONICS_ORDER.map((u) => byUpper[u]) : ABC.LETTERS.slice();
  }

  // Active pool = every item seen so far + enough new items to keep `maxShaky` letters in play.
  function buildPool(profile, order) {
    const letters = orderedLetters(order);
    const all = letters.map((L) => ({ letter: L, lower: false, key: L.upper }));
    letters.forEach((L) => {
      const up = peek(profile, L.upper);
      const lo = peek(profile, L.lower);
      // Lowercase unlocks per letter once its uppercase is mastered (and stays once started).
      if ((up && up.mastered) || (lo && lo.seen)) all.push({ letter: L, lower: true, key: L.lower });
    });

    const isSeen = (i) => { const s = peek(profile, i.key); return s && s.seen > 0; };
    const isShaky = (i) => { const s = peek(profile, i.key); return !s.mastered && s.streak < 2; };

    const seen = all.filter(isSeen);
    const fresh = all.filter((i) => !isSeen(i)).sort((a, b) => b.lower - a.lower); // unlocked lowercase first
    const pool = seen.slice();
    let shaky = seen.filter(isShaky).length;
    for (const i of fresh) {
      if (shaky >= CFG.maxShaky) break;
      pool.push(i);
      shaky++;
    }
    return { pool };
  }

  function weight(s) {
    if (!s || !s.seen) return 3;             // new
    if (s.mastered) return 0.5;              // occasional review
    return 2 + Math.max(0, 2 - s.streak);    // weak letters come up most
  }

  function nextItem(profile, order) {
    const { pool } = buildPool(profile, order);
    if (!Object.keys(profile.items).length) return pool[0]; // very first question: start at the beginning
    const avoid = profile.lastKeys.slice(0, pool.length > 3 ? 2 : 1);
    let candidates = pool.filter((i) => !avoid.includes(i.key));
    if (!candidates.length) candidates = pool;

    const weights = candidates.map((i) => weight(peek(profile, i.key)));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < candidates.length; i++) {
      r -= weights[i];
      if (r <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
  }

  // Newly unlocked lowercase letters start 2 levels easier so the case switch isn't a cliff.
  function effectiveLevel(profile, item) {
    const s = peek(profile, item.key);
    if (item.lower && (!s || s.seen < 3)) return Math.max(1, profile.level - 2);
    return profile.level;
  }

  function buildChoices(profile, item) {
    const cfg = LEVELS[effectiveLevel(profile, item)] || LEVELS[1];
    const target = charOf(item);
    const map = item.lower ? ABC.CONFUSABLE_LOWER : ABC.CONFUSABLE_UPPER;
    const similar = (c) => (map[target] || []).includes(c) || (map[c] || []).includes(target);
    const alphabet = ABC.LETTERS.map((L) => (item.lower ? L.lower : L.upper)).filter((c) => c !== target);

    const picks = [];
    if (cfg.confusables === 'include') {
      const look = alphabet.filter(similar);
      if (look.length) picks.push(rand(look));
    }
    let rest = alphabet.filter((c) => !picks.includes(c));
    if (cfg.confusables === 'avoid') rest = rest.filter((c) => !similar(c));
    shuffle(rest);
    while (picks.length < cfg.choices - 1 && rest.length) picks.push(rest.pop());

    return shuffle([{ char: target, correct: true }, ...picks.map((c) => ({ char: c, correct: false }))]);
  }

  function updateLevel(profile, firstTry) {
    const w = (profile.recent = profile.recent.concat(firstTry ? 1 : 0).slice(-CFG.windowSize));
    const good = w.reduce((a, b) => a + b, 0);
    const lvl = profile.level;
    if (lvl < CFG.maxLevel && w.length >= CFG.windowSize && good >= CFG.levelUpNeeds[lvl]) {
      profile.level++;
      profile.recent = [];
      return 'up';
    }
    if (lvl > 1 && w.length >= CFG.minAnswersForDown && good / w.length < CFG.levelDownBelow) {
      profile.level--;
      profile.recent = [];
      return 'down';
    }
    return null;
  }

  // firstTry = correct with no misses and no hint. Only first-try answers build mastery.
  function recordAnswer(profile, item, firstTry, now = Date.now()) {
    const s = stat(profile, item.key);
    const wasMastered = s.mastered;
    s.seen++;
    s.lastSeen = now;
    if (firstTry) {
      s.firstTry++;
      s.streak++;
      if (s.lastCorrectSession !== profile.sessionNo) {
        s.sessionsCorrect++;
        s.lastCorrectSession = profile.sessionNo;
      }
    } else {
      s.streak = 0;
    }
    s.mastered = s.streak >= CFG.masteryStreak && s.sessionsCorrect >= CFG.masterySessions;
    profile.lastKeys = [item.key].concat(profile.lastKeys).slice(0, 2);
    return { newlyMastered: !wasMastered && s.mastered, levelChange: updateLevel(profile, firstTry) };
  }

  return { CFG, LEVELS, charOf, touchSession, nextItem, buildChoices, recordAnswer, buildPool };
})();

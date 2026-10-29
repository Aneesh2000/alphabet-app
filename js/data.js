// Static content: letters, example words, look-alike letters, letter orders, stickers.
window.ABC = window.ABC || {};

// say:   optional override for how TTS pronounces the letter NAME. Normally unset: phrases always say
//        "the letter A", which voices read as the letter name (a bare "A" reads as "uh", "ay" as "eye").
// sound: phonetic spelling TTS uses for the letter SOUND. Tune these by ear per voice.
// audio: optional recorded clip path (e.g. "audio/a.mp3"); when set it replaces TTS praise.
// position: "end" when the example word ends with the letter instead of starting with it.
ABC.LETTERS = [
  { upper: 'A', lower: 'a', sound: 'ah',   word: 'Apple',    emoji: '🍎' },
  { upper: 'B', lower: 'b', sound: 'buh',  word: 'Ball',     emoji: '⚽' },
  { upper: 'C', lower: 'c', sound: 'kuh',  word: 'Cat',      emoji: '🐱' },
  { upper: 'D', lower: 'd', sound: 'duh',  word: 'Dog',      emoji: '🐶' },
  { upper: 'E', lower: 'e', sound: 'eh',   word: 'Egg',      emoji: '🥚' },
  { upper: 'F', lower: 'f', sound: 'fff',  word: 'Fish',     emoji: '🐟' },
  { upper: 'G', lower: 'g', sound: 'guh',  word: 'Goat',     emoji: '🐐' },
  { upper: 'H', lower: 'h', sound: 'huh',  word: 'Hat',      emoji: '🎩' },
  { upper: 'I', lower: 'i', sound: 'ih',   word: 'Insect',   emoji: '🐛' },
  { upper: 'J', lower: 'j', sound: 'juh',  word: 'Juice',    emoji: '🧃' },
  { upper: 'K', lower: 'k', sound: 'kuh',  word: 'Key',      emoji: '🔑' },
  { upper: 'L', lower: 'l', sound: 'lll',  word: 'Lion',     emoji: '🦁' },
  { upper: 'M', lower: 'm', sound: 'mmm',  word: 'Moon',     emoji: '🌙' },
  { upper: 'N', lower: 'n', sound: 'nnn',  word: 'Nose',     emoji: '👃' },
  { upper: 'O', lower: 'o', sound: 'aw',   word: 'Octopus',  emoji: '🐙' },
  { upper: 'P', lower: 'p', sound: 'puh',  word: 'Pig',      emoji: '🐷' },
  { upper: 'Q', lower: 'q', sound: 'kwuh', word: 'Queen',    emoji: '👸' },
  { upper: 'R', lower: 'r', sound: 'rrr',  word: 'Rabbit',   emoji: '🐰' },
  { upper: 'S', lower: 's', sound: 'sss',  word: 'Sun',      emoji: '☀️' },
  { upper: 'T', lower: 't', sound: 'tuh',  word: 'Tiger',    emoji: '🐯' },
  { upper: 'U', lower: 'u', sound: 'uh',   word: 'Umbrella', emoji: '☂️' },
  { upper: 'V', lower: 'v', sound: 'vvv',  word: 'Van',      emoji: '🚐' },
  { upper: 'W', lower: 'w', sound: 'wuh',  word: 'Whale',    emoji: '🐳' },
  { upper: 'X', lower: 'x', sound: 'ks',   word: 'Fox',      emoji: '🦊', position: 'end' },
  { upper: 'Y', lower: 'y', sound: 'yuh',  word: 'Yo-yo',    emoji: '🪀' },
  { upper: 'Z', lower: 'z', say: { 'en-US': 'zee', default: 'zed' }, sound: 'zzz', word: 'Zebra', emoji: '🦓' },
];

// Jolly Phonics teaching order: kids can blend "sat", "pin", "tin" after the first 6.
ABC.PHONICS_ORDER = 'SATIPNCKEHRMDGOULFBJZWVYXQ'.split('');

// Letters young children commonly mix up. Used to pick harder distractors at higher levels
// and to AVOID them at level 1. Lookups are checked in both directions.
ABC.CONFUSABLE_UPPER = {
  A: ['V'], B: ['P', 'R', 'D'], C: ['G', 'O'], D: ['O', 'B'], E: ['F'], F: ['E', 'P'],
  G: ['C'], H: ['N'], I: ['L', 'T', 'J'], K: ['X'], M: ['N', 'W'], O: ['Q', 'C', 'D'],
  P: ['R', 'B'], U: ['V'], V: ['U', 'W', 'Y'], X: ['Y'], S: ['Z'], Z: ['N'],
};
ABC.CONFUSABLE_LOWER = {
  a: ['o', 'e'], b: ['d', 'p'], c: ['e', 'o'], d: ['q'], f: ['t'], g: ['q'], h: ['n'],
  i: ['l', 'j'], k: ['x'], m: ['n'], n: ['u', 'r'], p: ['q'], u: ['v'], v: ['w', 'y'],
  s: ['z'],
};

// Awarded in order, one sticker per 10 reward points (5 first-try stars).
ABC.STICKERS = [
  ['Animals', '🦄 🐲 🦖 🐬 🦋 🐢 🦜 🐧 🦒 🐘'],
  ['Space',   '🚀 🪐 🌟 ☄️ 🛸 👽 🌍 🌈 🌞 🌠'],
  ['Food',    '🍕 🍩 🧁 🍦 🍉 🍓 🍪 🥞 🍔 🍿'],
].flatMap(([theme, list]) => list.split(' ').map((emoji) => ({ emoji, theme })));

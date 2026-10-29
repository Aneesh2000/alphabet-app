// Stars, sparkles and stickers.
window.ABC = window.ABC || {};

ABC.Rewards = (function () {
  'use strict';
  const POINTS_PER_STICKER = 10;

  // First-try answer: star (2 pts). Correct after a miss/hint: sparkle (1 pt), so effort still counts.
  function award(profile, firstTry) {
    if (firstTry) { profile.stars++; profile.points += 2; } else { profile.sparkles++; profile.points += 1; }
    const earned = Math.floor(profile.points / POINTS_PER_STICKER);
    let sticker = null;
    if (earned > profile.stickers.length && profile.stickers.length < ABC.STICKERS.length) {
      sticker = ABC.STICKERS[profile.stickers.length].emoji;
      profile.stickers.push(sticker);
    }
    return { sticker };
  }

  const progress = (profile) => (profile.points % POINTS_PER_STICKER) / POINTS_PER_STICKER;

  return { award, progress, POINTS_PER_STICKER };
})();

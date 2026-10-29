// Sound effects synthesized with Web Audio, so there are no audio files to cache.
window.ABC = window.ABC || {};

ABC.Sfx = (function () {
  'use strict';
  let ctx = null;

  // Call from a user gesture; browsers start AudioContext suspended.
  function unlock() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
      }
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { /* no audio available */ }
  }

  function tone(freq, start, dur, type = 'sine', vol = 0.18) {
    if (!ctx) return;
    const t = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  const chime = () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.09, 0.35, 'triangle'));
  const boop = () => { tone(330, 0, 0.18); tone(247, 0.15, 0.25); };
  const fanfare = () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.3, 'triangle'));

  return { unlock, chime, boop, fanfare };
})();

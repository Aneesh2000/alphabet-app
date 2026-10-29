// Text-to-speech wrapper: voice selection, cancellable queue, recorded-audio override.
window.ABC = window.ABC || {};

ABC.Speech = (function () {
  'use strict';
  const synth = window.speechSynthesis || null;
  const supported = !!(synth && window.SpeechSynthesisUtterance);
  const RATE = 0.8;
  const PITCH = 1.1;

  let lang = 'en-US';
  let voice = null;
  let broken = !supported;   // set when the engine reports it can't speak -> visual fallback
  let token = 0;             // bumped on every new say()/cancel() so stale queues stop
  let audioEl = null;
  let audioDone = null;

  // Prefer an exact accent match, then any English voice; offline (localService) voices win.
  function pickVoice() {
    if (!supported) return;
    const want = lang.toLowerCase();
    const base = want.split('-')[0];
    let best = null;
    let bestScore = -1;
    synth.getVoices().forEach((v) => {
      const vl = v.lang.toLowerCase().replace('_', '-');
      if (!vl.startsWith(base)) return;
      let score = vl === want ? 4 : 1;
      if (v.localService) score += 3;
      if (v.default) score += 0.5;
      if (score > bestScore) { best = v; bestScore = score; }
    });
    voice = best;
  }

  if (supported) {
    pickVoice();
    if (synth.addEventListener) synth.addEventListener('voiceschanged', pickVoice);
  }

  function setLang(l) {
    lang = l;
    pickVoice();
  }

  // Must run inside a click/touchend handler: iOS only lets speech start from a user gesture.
  function unlock() {
    if (!supported) return;
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      synth.speak(u);
    } catch (e) { /* ignore */ }
  }

  function speakOne(text, my) {
    return new Promise((resolve) => {
      if (my !== token) return resolve();
      if (broken) return setTimeout(resolve, 600); // keep pacing roughly similar without audio
      let done = false;
      // Some engines never fire onend; never let the game hang waiting for it.
      const timer = setTimeout(finish, 1500 + text.length * 110);
      function finish() {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve();
      }
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = voice ? voice.lang : lang;
        if (voice) u.voice = voice;
        u.rate = RATE;
        u.pitch = PITCH;
        u.onend = finish;
        u.onerror = (e) => {
          if (e.error !== 'interrupted' && e.error !== 'canceled') broken = true;
          finish();
        };
        synth.speak(u);
      } catch (e) {
        broken = true;
        finish();
      }
    });
  }

  // Speaks parts in order. Resolves when finished OR when interrupted by another say/cancel.
  async function say(parts) {
    const my = ++token;
    stopAudio();
    if (supported) synth.cancel();
    for (const p of parts) {
      if (my !== token) return;
      await speakOne(p, my);
    }
  }

  function stopAudio() {
    if (audioEl) { audioEl.pause(); audioEl = null; }
    if (audioDone) { audioDone(); audioDone = null; }
  }

  // Plays a recorded clip; rejects if it can't load so the caller can fall back to TTS.
  function playFile(url) {
    ++token;
    stopAudio();
    if (supported) synth.cancel();
    return new Promise((resolve, reject) => {
      const a = new Audio(url);
      audioEl = a;
      audioDone = resolve;
      a.onended = () => { audioDone = null; resolve(); };
      a.onerror = () => { audioDone = null; reject(new Error('audio failed')); };
      a.play().catch(reject);
    });
  }

  function cancel() {
    ++token;
    stopAudio();
    if (supported) synth.cancel();
  }

  function nameFor(L) {
    if (L.say && typeof L.say === 'object') return lang === 'en-US' ? L.say['en-US'] : L.say.default;
    return L.say || L.upper;
  }

  function voiceInfo() {
    if (!supported) return null;
    pickVoice();
    return voice ? { name: voice.name, lang: voice.lang, offline: voice.localService } : null;
  }

  return {
    setLang, unlock, say, playFile, cancel, nameFor, voiceInfo,
    isAvailable: () => !broken,
  };
})();

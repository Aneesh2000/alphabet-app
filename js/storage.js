// Versioned localStorage persistence. Falls back to memory if storage is blocked (private mode).
window.ABC = window.ABC || {};

ABC.Storage = (function () {
  'use strict';
  const KEY = 'abc-owl';
  const VERSION = 1;
  const MAX_PROFILES = 4;
  const AVATARS = ['🐼', '🦊', '🐸', '🐵'];
  let memoryOnly = false;

  function defaults() {
    return { version: VERSION, settings: { order: 'az', accent: 'en-US' }, profiles: [] };
  }

  function newProfile(avatar) {
    return {
      id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      avatar,
      level: 1,          // adaptive difficulty 1..4
      points: 0,         // first-try = 2, hinted = 1; every 10 earns a sticker
      stars: 0,          // first-try correct answers
      sparkles: 0,       // correct after a miss or hint
      stickers: [],
      items: {},         // per-letter stats keyed by "A" / "a"
      recent: [],        // rolling window of first-try results (1/0) for leveling
      lastKeys: [],      // last asked items, to avoid repeats
      sessionNo: 0,
      lastActive: 0,
    };
  }

  function migrate(d) {
    // Only one schema so far: anything unknown starts fresh rather than crashing.
    if (!d || d.version !== VERSION) return defaults();
    d.settings = Object.assign(defaults().settings, d.settings);
    d.profiles = (d.profiles || []).map((p) => Object.assign(newProfile(p.avatar), p));
    return d;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? migrate(JSON.parse(raw)) : defaults();
    } catch (e) {
      memoryOnly = true;
      return defaults();
    }
  }

  function save(data) {
    if (memoryOnly) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      memoryOnly = true;
    }
  }

  function addProfile(data) {
    if (data.profiles.length >= MAX_PROFILES) return null;
    const used = data.profiles.map((p) => p.avatar);
    const p = newProfile(AVATARS.find((a) => !used.includes(a)) || AVATARS[0]);
    data.profiles.push(p);
    return p;
  }

  function resetProfile(p) {
    const fresh = newProfile(p.avatar);
    fresh.id = p.id;
    Object.keys(p).forEach((k) => delete p[k]);
    Object.assign(p, fresh);
  }

  function removeProfile(data, id) {
    data.profiles = data.profiles.filter((p) => p.id !== id);
  }

  // Asks the browser not to evict our data (Safari wipes storage of unused, non-installed sites).
  function requestPersistence() {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }

  return {
    load, save, addProfile, resetProfile, removeProfile, requestPersistence,
    MAX_PROFILES, isMemoryOnly: () => memoryOnly,
  };
})();

// Game controller: screens, question flow, feedback, rewards, grown-ups panel.
(function () {
  'use strict';
  const { Storage, Engine, Speech, Sfx, Rewards } = ABC;

  const ROUND_LEN = 8;          // questions per round, then a "Great job!" break
  const HINT_IDLE_MS = 6000;    // glow the answer if the child hasn't tapped for this long
  const NEXT_MIN_MS = 1500;     // keep the example on screen at least this long
  const NEXT_NUDGE_MS = 3000;   // "Tap the arrow!" if Next isn't pressed
  const AUTO_NEXT_MS = 10000;   // advance on its own after this
  const TAP_COOLDOWN_MS = 300;  // ignore taps right after input unlocks (carry-over taps)
  const HOLD_MS = 3000;         // grown-ups gate

  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const data = Storage.load();
  let profile = null;
  let round = null;     // { results: ['⭐'|'✨'] }
  let q = null;         // current question
  let qSeq = 0;
  let paused = false;
  let timers = [];
  let idleTimer = null;
  let stickerBack = 'end';

  // ---------- small helpers ----------
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; clearIdle(); }
  function clearIdle() { clearTimeout(idleTimer); idleTimer = null; }
  const alive = (id) => !paused && q && q.id === id;

  function show(name) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
  }

  // Buttons use "click": iOS only grants audio permission on click/touchend, not pointerdown.
  function onClick(el, fn) { el.addEventListener('click', (e) => { e.preventDefault(); fn(e); }); }

  // Letter tiles use pointerdown for speed; extra fingers (non-primary pointers) are ignored.
  function onPress(el, fn) {
    el.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary) return;
      e.preventDefault();
      fn(e);
    });
  }

  function bubble(text) { $('bubble').textContent = text; }
  function talking(on) { $('mascot').classList.toggle('talking', on && !reduceMotion); }
  function soundWarning() { $('sound-warning').classList.toggle('hidden', Speech.isAvailable()); }

  // ---------- phrases ----------
  function promptText(item) {
    // Always "the letter X" with no comma: that context makes voices say the letter name.
    const name = Speech.nameFor(item.letter);
    return item.lower ? `Find the small letter ${name}!` : `Find the letter ${name}!`;
  }

  // forScreen: show the real letter ("a") instead of the spoken form ("A", or "zee"/"zed").
  function praiseParts(item, firstTry, levelUp, forScreen) {
    const L = item.letter;
    const name = (item.lower ? 'The small letter ' : 'The letter ') + (forScreen ? Engine.charOf(item) : Speech.nameFor(L));
    const word = L.word.toLowerCase();
    const parts = [firstTry ? 'Yes!' : 'You kept trying! Yes!'];
    parts.push(L.position === 'end'
      ? `${name} says ${L.sound}, like at the end of ${word}!`
      : `${name} says ${L.sound}, as in ${word}!`);
    if (levelUp) parts.push('Wow! You are getting so good!');
    return parts;
  }

  // ---------- start screen ----------
  function renderProfiles() {
    const box = $('profiles');
    box.innerHTML = '';
    data.profiles.forEach((p) => {
      const b = document.createElement('button');
      b.className = 'profile-btn';
      b.textContent = p.avatar;
      b.setAttribute('aria-label', 'Play as ' + p.avatar);
      onClick(b, () => startProfile(p.id));
      box.appendChild(b);
    });
    if (data.profiles.length < Storage.MAX_PROFILES) {
      const add = document.createElement('button');
      add.className = 'profile-btn add' + (data.profiles.length ? '' : ' first');
      add.textContent = data.profiles.length ? '+' : '▶';
      add.setAttribute('aria-label', 'New player');
      onClick(add, () => {
        const p = Storage.addProfile(data);
        Storage.save(data);
        startProfile(p.id);
      });
      box.appendChild(add);
    }
  }

  function goHome() {
    clearTimers();
    Speech.cancel();
    q = null;
    renderProfiles();
    show('start');
  }

  function startProfile(id) {
    // This runs inside a click, so it's our chance to unlock audio for the whole session.
    Sfx.unlock();
    Speech.unlock();
    Speech.setLang(data.settings.accent);
    profile = data.profiles.find((p) => p.id === id);
    Engine.touchSession(profile);
    Storage.save(data);
    startRound();
  }

  // ---------- round & question flow ----------
  function startRound() {
    round = { results: [] };
    renderDots();
    updateCounter();
    show('play');
    nextQuestion();
  }

  function nextQuestion() {
    clearTimers();
    Speech.cancel();
    if (round.results.length >= ROUND_LEN) return endRound();

    Engine.touchSession(profile);
    const item = Engine.nextItem(profile, data.settings.order);
    q = {
      id: ++qSeq,
      item,
      tiles: Engine.buildChoices(profile, item),
      misses: 0,
      hinted: false,
      done: false,
      locked: true,
      unlockedAt: 0,
    };
    renderQuestion();
    askPrompt();
  }

  function renderQuestion() {
    const box = $('tiles');
    box.innerHTML = '';
    box.className = 'tiles n' + q.tiles.length;
    q.tiles.forEach((t, i) => {
      const b = document.createElement('button');
      b.className = 'tile c' + i;
      b.textContent = t.char;
      b.setAttribute('aria-label', 'Letter ' + t.char);
      t.el = b;
      onPress(b, () => onTile(t));
      box.appendChild(b);
    });
    $('example').classList.add('hidden');
    $('btn-next').classList.add('hidden');
  }

  function lock() { q.locked = true; }
  function unlock() { q.locked = false; q.unlockedAt = performance.now(); }

  function setPromptBubble() {
    // With working speech the bubble doesn't reveal the letter, so the child has to listen.
    if (Speech.isAvailable()) bubble(q.item.lower ? 'Find the small letter… 👂' : 'Find the letter… 👂');
    else bubble('Find: ' + Engine.charOf(q.item));
  }

  function askPrompt(prefix) {
    const id = q.id;
    lock();
    clearIdle();
    setPromptBubble();
    talking(true);
    const parts = prefix ? [prefix, promptText(q.item)] : [promptText(q.item)];
    Speech.say(parts).then(() => {
      if (!alive(id) || q.done) return;
      talking(false);
      setPromptBubble(); // speech may have just failed -> switch to the visual fallback
      soundWarning();
      unlock();
      armIdleHint();
    });
  }

  function armIdleHint() {
    clearIdle();
    if (q.hinted) return;
    const id = q.id;
    idleTimer = setTimeout(() => {
      if (!alive(id) || q.done) return;
      showHint();
      Speech.say([promptText(q.item)]);
    }, HINT_IDLE_MS);
  }

  function showHint() {
    q.hinted = true;
    q.tiles.find((t) => t.correct).el.classList.add('glow');
  }

  function onTile(t) {
    if (!q || q.done || q.locked || t.wrong) return;
    if (performance.now() - q.unlockedAt < TAP_COOLDOWN_MS) return;
    clearIdle();
    if (t.correct) onCorrect(t); else onWrong(t);
  }

  function onWrong(t) {
    const id = q.id;
    q.misses++;
    t.wrong = true;
    t.el.classList.add('wobble', 'dimmed');
    Sfx.boop();
    lock();
    bubble('Oops! Try again!');
    talking(true);
    // Miss 1: replay the prompt. Miss 2 (or only the answer left): glow the right tile.
    const remaining = q.tiles.filter((x) => !x.correct && !x.wrong).length;
    const glow = q.misses >= 2 || remaining === 0;
    Speech.say(['Oops! Try again!', promptText(q.item)]).then(() => {
      if (!alive(id) || q.done) return;
      talking(false);
      setPromptBubble();
      if (glow) showHint();
      unlock();
      armIdleHint();
    });
  }

  function onCorrect(t) {
    const id = q.id;
    q.done = true;
    clearTimers();
    Speech.cancel();

    const firstTry = q.misses === 0 && !q.hinted;
    const result = Engine.recordAnswer(profile, q.item, firstTry);
    const reward = Rewards.award(profile, firstTry);
    round.results.push(firstTry ? '⭐' : '✨');
    Storage.save(data);

    t.el.classList.remove('glow');
    t.el.classList.add('correct');
    $('tiles').classList.add('solved');
    Sfx.chime();
    confetti();
    flyReward(firstTry ? '⭐' : '✨', t.el);
    renderDots();
    showExample();

    const levelUp = result.levelChange === 'up';
    const parts = praiseParts(q.item, firstTry, levelUp);
    bubble(praiseParts(q.item, firstTry, levelUp, true).join(' '));
    talking(true);
    const started = performance.now();
    const audio = q.item.letter.audio;
    const speaking = audio
      ? Speech.playFile(audio).catch(() => Speech.say(parts))
      : Speech.say(parts);
    speaking.then(() => {
      if (!alive(id)) return;
      talking(false);
      const wait = Math.max(0, NEXT_MIN_MS - (performance.now() - started));
      later(() => {
        if (!alive(id)) return;
        if (reward.sticker) showSticker(reward.sticker, () => alive(id) && showNext());
        else showNext();
      }, wait);
    });
  }

  function showExample() {
    const L = q.item.letter;
    const end = L.position === 'end';
    let word = q.item.lower ? L.word.toLowerCase() : L.word;
    if (end && !q.item.lower) word = word.toUpperCase(); // so the highlighted X matches the tile
    const idx = end ? word.length - 1 : 0;
    const w = $('example-word');
    w.innerHTML = '';
    const mark = document.createElement('mark');
    mark.textContent = word[idx];
    w.append(word.slice(0, idx), mark, word.slice(idx + 1));
    $('example-emoji').textContent = L.emoji;
    $('example').classList.remove('hidden');
  }

  function showNext() {
    const id = q.id;
    $('btn-next').classList.remove('hidden');
    later(() => alive(id) && Speech.say(['Tap the arrow!']), NEXT_NUDGE_MS);
    later(() => alive(id) && nextQuestion(), AUTO_NEXT_MS);
  }

  function endRound() {
    q = null;
    const stars = round.results.filter((r) => r === '⭐').length;
    $('end-stars').textContent = round.results.join(' ');
    show('end');
    Sfx.fanfare();
    Speech.say([stars ? `Great job! You got ${stars} stars!` : 'Great job! You kept trying!']);
  }

  // ---------- rewards UI ----------
  function renderDots() {
    const box = $('dots');
    box.innerHTML = '';
    for (let i = 0; i < ROUND_LEN; i++) {
      const d = document.createElement('span');
      d.className = 'dot' + (i < round.results.length ? ' done' : '');
      box.appendChild(d);
    }
  }

  function updateCounter() {
    $('star-count').textContent = profile.stars;
    $('sparkle-count').textContent = profile.sparkles;
    $('sticker-bar').style.width = Rewards.progress(profile) * 100 + '%';
  }

  function flyReward(symbol, fromEl) {
    const done = () => {
      updateCounter();
      $('counter').classList.add('bump');
      setTimeout(() => $('counter').classList.remove('bump'), 200);
    };
    if (reduceMotion || !document.body.animate) return done();
    const a = fromEl.getBoundingClientRect();
    const b = $('counter').getBoundingClientRect();
    const s = document.createElement('div');
    s.className = 'flyer';
    s.textContent = symbol;
    s.style.left = a.left + a.width / 2 + 'px';
    s.style.top = a.top + a.height / 2 + 'px';
    document.body.appendChild(s);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    s.animate(
      [
        { transform: 'translate(-50%, -50%) scale(1.2)' },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.4)`, opacity: 0.7 },
      ],
      { duration: 900, easing: 'cubic-bezier(.5,-0.4,.7,1)' }
    ).onfinish = () => { s.remove(); done(); };
  }

  function confetti() {
    if (reduceMotion) return;
    const layer = $('confetti');
    const colors = ['#ff6b6b', '#4dabf7', '#51cf66', '#ffd43b', '#9775fa', '#f783ac'];
    for (let i = 0; i < 30; i++) {
      const p = document.createElement('i');
      p.style.left = Math.random() * 100 + 'vw';
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = Math.random() * 0.3 + 's';
      p.style.animationDuration = 1 + Math.random() * 0.8 + 's';
      layer.appendChild(p);
      setTimeout(() => p.remove(), 2300);
    }
  }

  function showSticker(emoji, onClose) {
    const ov = $('overlay-sticker');
    $('sticker-new').textContent = emoji;
    ov.classList.remove('hidden');
    Sfx.fanfare();
    Speech.say(['You got a new sticker!']);
    let closable = false;
    let closed = false;
    setTimeout(() => { closable = true; }, 800);
    const close = () => {
      if (!closable || closed) return;
      closed = true;
      ov.classList.add('hidden');
      ov.removeEventListener('click', close);
      onClose();
    };
    ov.addEventListener('click', close);
    setTimeout(() => { closable = true; close(); }, 6000);
  }

  function openStickers(from) {
    stickerBack = from;
    const book = $('sticker-book');
    book.innerHTML = '';
    const themes = [...new Set(ABC.STICKERS.map((s) => s.theme))];
    let idx = 0;
    themes.forEach((theme) => {
      const h = document.createElement('h3');
      h.textContent = theme;
      const grid = document.createElement('div');
      grid.className = 'sticker-grid';
      ABC.STICKERS.filter((s) => s.theme === theme).forEach((s) => {
        const cell = document.createElement('div');
        const have = idx < profile.stickers.length;
        cell.className = 'sticker' + (have ? '' : ' locked');
        cell.textContent = have ? s.emoji : '?';
        grid.appendChild(cell);
        idx++;
      });
      book.append(h, grid);
    });
    show('stickers');
  }

  // ---------- grown-ups gate & panel ----------
  function setupParentGate() {
    const btn = $('btn-parent');
    let t = null;
    const cancel = () => { clearTimeout(t); btn.classList.remove('holding'); };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.classList.add('holding');
      t = setTimeout(() => { cancel(); openParent(); }, HOLD_MS);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, cancel));
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function openParent() {
    $('set-order').value = data.settings.order;
    $('set-accent').value = data.settings.accent;
    renderVoiceInfo();
    renderParentProfiles();
    $('storage-note').textContent = Storage.isMemoryOnly()
      ? '⚠️ This browser is blocking storage (private mode?). Progress will be lost when the app closes.'
      : '';
    show('parent');
  }

  function renderVoiceInfo() {
    Speech.setLang(data.settings.accent);
    const v = Speech.voiceInfo();
    $('voice-info').textContent = v
      ? `Voice: ${v.name} (${v.lang})${v.offline ? ' · works offline ✓' : ' · needs internet'}`
      : 'No matching voice found yet. Try “Test voice”, another accent, or connect to the internet once.';
  }

  function renderParentProfiles() {
    const box = $('parent-profiles');
    box.innerHTML = '';
    if (!data.profiles.length) box.textContent = 'No players yet.';
    data.profiles.forEach((p) => {
      const learned = Object.values(p.items).filter((s) => s.mastered).length;
      const row = document.createElement('div');
      row.className = 'player-row';
      row.innerHTML = `<span class="avatar">${p.avatar}</span>
        <span class="info">Level ${p.level} · ⭐ ${p.stars} · ✨ ${p.sparkles} · ${learned} letters learned · ${p.stickers.length} stickers</span>`;
      const reset = document.createElement('button');
      reset.className = 'plain-btn';
      reset.textContent = 'Reset';
      onClick(reset, () => {
        if (!confirm(`Reset all progress for ${p.avatar}?`)) return;
        Storage.resetProfile(p);
        Storage.save(data);
        renderParentProfiles();
      });
      const del = document.createElement('button');
      del.className = 'plain-btn danger';
      del.textContent = 'Delete';
      onClick(del, () => {
        if (!confirm(`Delete player ${p.avatar}?`)) return;
        Storage.removeProfile(data, p.id);
        Storage.save(data);
        renderParentProfiles();
      });
      row.append(reset, del);
      box.appendChild(row);
    });
  }

  // ---------- wiring ----------
  onClick($('btn-home'), goHome);
  onClick($('btn-replay'), () => { if (q && !q.done) askPrompt(); });
  onClick($('btn-next'), () => { if (q && q.done) nextQuestion(); });
  onClick($('btn-again'), startRound);
  onClick($('btn-book'), () => openStickers('end'));
  onClick($('btn-end-home'), goHome);
  onClick($('btn-stickers-back'), () => show(stickerBack));
  onClick($('btn-parent-close'), goHome);
  onClick($('btn-test-voice'), () => {
    Speech.unlock();
    Speech.setLang(data.settings.accent);
    Speech.say(['Hello! The letter A says ah, as in apple.']).then(renderVoiceInfo);
  });
  $('set-order').addEventListener('change', (e) => { data.settings.order = e.target.value; Storage.save(data); });
  $('set-accent').addEventListener('change', (e) => {
    data.settings.accent = e.target.value;
    Storage.save(data);
    renderVoiceInfo();
  });
  setupParentGate();

  // Pause when the app is hidden (phone locked, app switched); repeat the question on return.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      paused = true;
      clearTimers();
      Speech.cancel();
      talking(false);
      return;
    }
    paused = false;
    if (!q || !$('screen-play').classList.contains('active')) return;
    if (!$('overlay-sticker').classList.contains('hidden')) return;
    if (q.done) showNext(); else askPrompt();
  });

  // Block pinch-zoom / long-press menus that kids trigger by accident.
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  Storage.requestPersistence();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  renderProfiles();
})();

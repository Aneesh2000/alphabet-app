const puppeteer = require('puppeteer-core');
// End-to-end browser test (headless Chrome, fake fast TTS).
// Usage: node tests/e2e.js [baseUrl] [screenshotDir]
//   baseUrl defaults to http://localhost:8765/ ; needs puppeteer-core resolvable (see SKILL.md).
const BASE = process.argv[2] || 'http://localhost:8765/';
const OUT = process.argv[3] || require('os').tmpdir();
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  // Fast fake TTS that logs what is spoken.
  await page.evaluateOnNewDocument(() => {
    window.__spoken = [];
    const fake = { speaking: false, getVoices: () => [],
      addEventListener() {}, cancel() {}, speak(u) { window.__spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 30); } };
    Object.defineProperty(window, 'speechSynthesis', { value: fake });
  });
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: OUT + '/1-start.png' });

  await page.click('.profile-btn.add');
  await sleep(400);
  const tiles = async () => page.$$eval('#tiles .tile', els => els.map(e => ({ t: e.textContent, cls: e.className })));
  console.log('Q1 tiles', JSON.stringify(await tiles()), 'spoken:', await page.evaluate(() => window.__spoken.slice(-1)[0]));
  // Tap a wrong tile first
  const wrongIdx = (await tiles()).findIndex(t => t.t !== 'A');
  await (await page.$$('#tiles .tile'))[wrongIdx].click();
  await sleep(100);
  console.log('after wrong:', JSON.stringify(await tiles()), 'bubble:', await page.$eval('#bubble', e => e.textContent));
  await sleep(400);
  console.log('after wrong + replay, glow?', (await tiles()).map(t => t.cls).join(' | '));
  await page.screenshot({ path: OUT + '/2-wrong.png' });

  const answerCorrect = async () => {
    const key = await page.evaluate(() => window.__spoken.filter(s => s.startsWith('Find')).slice(-1)[0]);
    const m = key.match(/Find the (small )?letter (\w+)!/);
    let ch = m[2] === 'ay' ? 'A' : m[2] === 'zee' || m[2] === 'zed' ? 'Z' : m[2];
    if (m[1]) ch = ch.toLowerCase();
    const els = await page.$$('#tiles .tile');
    for (const el of els) if ((await el.evaluate(e => e.textContent)) === ch) { await el.click(); return ch; }
    throw new Error('target not found ' + ch);
  };
  await answerCorrect();
  await sleep(200);
  console.log('success bubble:', await page.$eval('#bubble', e => e.textContent), '| example:', await page.$eval('#example', e => e.textContent.trim()));
  await sleep(1600);
  console.log('next visible:', await page.$eval('#btn-next', e => !e.classList.contains('hidden')));
  await page.screenshot({ path: OUT + '/3-success.png' });

  let sawSticker = false;
  for (let i = 2; i <= 8; i++) {
    await page.click('#btn-next'); await sleep(600);
    const n = (await tiles()).length;
    await answerCorrect(); await sleep(1900);
    if (await page.$eval('#overlay-sticker', e => !e.classList.contains('hidden'))) {
      sawSticker = true; await page.screenshot({ path: OUT + '/4-sticker.png' });
      await sleep(900); await page.click('#overlay-sticker'); await sleep(300);
    }
    console.log(`Q${i} choices=${n}`);
  }
  await page.click('#btn-next'); await sleep(600);
  console.log('sticker overlay seen:', sawSticker, '| end screen:', await page.$eval('#screen-end', e => e.classList.contains('active')), await page.$eval('#end-stars', e => e.textContent));
  await page.screenshot({ path: OUT + '/5-end.png' });
  await page.click('#btn-book'); await sleep(200);
  await page.screenshot({ path: OUT + '/6-book.png' });
  await page.click('#btn-stickers-back'); await page.click('#btn-end-home'); await sleep(200);

  // Grown-ups gate: short press should NOT open, 3s hold should.
  const gear = await page.$('#btn-parent'); const box = await gear.boundingBox();
  await page.mouse.move(box.x + 10, box.y + 10); await page.mouse.down(); await sleep(500); await page.mouse.up();
  console.log('parent after short press:', await page.$eval('#screen-parent', e => e.classList.contains('active')));
  await page.mouse.down(); await sleep(3200); await page.mouse.up();
  console.log('parent after 3s hold:', await page.$eval('#screen-parent', e => e.classList.contains('active')), '|', await page.$eval('#parent-profiles', e => e.textContent.replace(/\s+/g, ' ').trim()));
  await page.screenshot({ path: OUT + '/7-parent.png' });

  // Persistence + offline
  await page.reload({ waitUntil: 'networkidle0' });
  console.log('profiles after reload:', await page.$$eval('.profile-btn:not(.add)', e => e.length), '| SW controlling:', await page.evaluate(() => !!navigator.serviceWorker.controller));
  await page.setOfflineMode(true);
  await page.reload({ waitUntil: 'load' });
  console.log('offline reload ok:', await page.$eval('.title', e => e.textContent), '| font loaded:', await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('700 40px Andika'); }));
  await page.setOfflineMode(false);

  // No-speech fallback: page where speech errors out
  const p2 = await browser.newPage();
  p2.on('pageerror', e => errors.push('p2 pageerror: ' + e.message));
  await p2.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true });
  await p2.evaluateOnNewDocument(() => {
    const fake = { getVoices: () => [], addEventListener() {}, cancel() {}, speak(u) { setTimeout(() => u.onerror && u.onerror({ error: 'synthesis-unavailable' }), 10); } };
    Object.defineProperty(window, 'speechSynthesis', { value: fake });
  });
  await p2.goto(BASE, { waitUntil: 'networkidle0' });
  await p2.click('.profile-btn:not(.add)'); await sleep(800);
  console.log('fallback bubble:', await p2.$eval('#bubble', e => e.textContent), '| mute icon shown:', await p2.$eval('#sound-warning', e => !e.classList.contains('hidden')));
  await p2.screenshot({ path: OUT + '/8-landscape-nospeech.png' });

  console.log('ERRORS:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error('TEST FAILED', e); process.exit(1); });

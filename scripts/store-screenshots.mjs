// Captures Play Store phone screenshots from the live app, signed in as the seeded demo tenant.
//
// Uses the installed Chrome through puppeteer-core, so nothing large is downloaded. Shots are
// 1080x1920, which is a true 9:16 and inside Play's 320 to 3840 per side limit. Never point this
// at a real tenant: store listings are public and permanent.
//
// Usage:
//   node scripts/store-screenshots.mjs --password "<demo account password>"
//   node scripts/store-screenshots.mjs --password "..." --headful   (watch it work)
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';

const arg = (flag, fallback = null) => {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
};
const CHROME = arg('--chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe');
const BASE = arg('--base', 'https://app.guildwright.app');
const EMAIL = arg('--email', 'playreview@guildwright.app');
const PASSWORD = arg('--password');
const OUT = arg('--out', 'store-screenshots');
const HEADFUL = process.argv.includes('--headful');

if (!PASSWORD) {
  console.error('Pass --password "<demo account password>". Not hardcoded on purpose.');
  process.exit(1);
}

// Route, filename, and how long to let the page settle. The clock widget and the dashboard cards
// both fetch after mount, so a fixed pause beats racing a spinner into the screenshot.
const SHOTS = [
  { path: '/', name: '1-dashboard', wait: 3500 },
  { path: '/timecards', name: '2-timecards', wait: 3000 },
  { path: '/projects', name: '3-projects', wait: 3000 },
  { path: '/estimates', name: '4-estimates', wait: 3000 },
  { path: '/expenses', name: '5-expenses', wait: 3000 },
  { path: '/crew-schedule', name: '6-schedule', wait: 3000 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: !HEADFUL,
    // 360 CSS px is a real phone width, so the app renders its mobile layout rather than the
    // desktop sidebar. At a 3x scale factor that outputs 1080x1920, an exact 9:16 for Play.
    defaultViewport: { width: 360, height: 640, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    args: ['--window-size=360,640', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36');

  console.log('signing in...');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('input[type="email"]', { timeout: 30000 });
  await page.type('input[type="email"]', EMAIL);
  await page.type('input[type="password"]', PASSWORD);
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
  ]);
  await sleep(4000);

  if (page.url().includes('/login')) {
    console.error('still on the login page. Check the password, or run with --headful to watch.');
    await browser.close();
    process.exit(1);
  }
  console.log('signed in, landed on', page.url());

  for (const shot of SHOTS) {
    await page.goto(`${BASE}${shot.path}`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
    await sleep(shot.wait);
    const file = `${OUT}/${shot.name}.png`;
    await page.screenshot({ path: file, type: 'png' });
    console.log('  captured', file);
  }

  await browser.close();
  console.log(`\nDone. ${SHOTS.length} shots in ${OUT}/ at 1080x1920.`);
  console.log('Play needs at least 2. Pick the ones that show real content and skip any that look empty.');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });

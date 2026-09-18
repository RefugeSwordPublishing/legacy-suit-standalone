// Captures store screenshots from the live app, signed in as the seeded demo tenant.
//
// Uses the installed Chrome through puppeteer-core, so nothing large is downloaded. Never point
// this at a real tenant: store listings are public and permanent.
//
// Device presets (--device), each a real phone's CSS size at a 3x scale factor:
//   play   360x640 -> 1080x1920, a true 9:16 inside Play's limits (default)
//   ios67  430x932 -> 1290x2796, the App Store's 6.7 inch size
//   ios65  428x926 -> 1284x2778, the App Store's 6.5 inch size
//   ios    both iOS sizes in one run, into <out>/6.7 and <out>/6.5
//
// Usage:
//   node scripts/store-screenshots.mjs --password "<demo account password>"
//   node scripts/store-screenshots.mjs --password "..." --device ios
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
const DEVICE = arg('--device', 'play');
const HEADFUL = process.argv.includes('--headful');

// An iPhone user agent for the iOS sizes, so anything that sniffs the platform behaves as it will
// in the real app. The layout itself follows the viewport width, not the agent string.
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
const PRESETS = {
  play: { width: 360, height: 640, ua: ANDROID_UA, dir: '', label: '1080x1920' },
  ios67: { width: 430, height: 932, ua: IPHONE_UA, dir: '6.7', label: '1290x2796' },
  ios65: { width: 428, height: 926, ua: IPHONE_UA, dir: '6.5', label: '1284x2778' },
};
const RUNS = DEVICE === 'ios' ? ['ios67', 'ios65'] : [DEVICE];
for (const r of RUNS) {
  if (!PRESETS[r]) {
    console.error(`Unknown --device "${r}". Use play, ios67, ios65 or ios.`);
    process.exit(1);
  }
}

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

const capture = async (presetName) => {
  const p = PRESETS[presetName];
  const outDir = p.dir ? `${OUT}/${p.dir}` : OUT;
  mkdirSync(outDir, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: !HEADFUL,
    // A real phone's CSS width, so the app renders its mobile layout rather than the desktop
    // sidebar. The 3x scale factor turns that into the pixel size each store asks for.
    defaultViewport: { width: p.width, height: p.height, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    args: [`--window-size=${p.width},${p.height}`, '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.setUserAgent(p.ua);

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
    const file = `${outDir}/${shot.name}.png`;
    await page.screenshot({ path: file, type: 'png' });
    console.log('  captured', file);
  }

  await browser.close();
  console.log(`Done. ${SHOTS.length} shots in ${outDir}/ at ${p.label}.`);
};

(async () => {
  for (const r of RUNS) await capture(r);
  console.log('\nPlay needs at least 2 shots, the App Store at least 3 per size.');
  console.log('Pick the ones that show real content and skip any that look empty.');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });

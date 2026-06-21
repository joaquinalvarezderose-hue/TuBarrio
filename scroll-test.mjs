import { chromium } from 'playwright';

const BASE = 'http://localhost:5174';
const MOBILE = { width: 390, height: 844 }; // iPhone 14 viewport

async function getScrollTop(page) {
  return page.evaluate(() => {
    const el = document.querySelector('main.flex-1');
    return el ? el.scrollTop : -1;
  });
}

async function scrollDown(page, px = 400) {
  await page.evaluate((px) => {
    const el = document.querySelector('main.flex-1');
    if (el) el.scrollTo(0, px);
  }, px);
  await page.waitForTimeout(300);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();

  const results = [];

  // Helper to test scroll reset between two routes
  async function testNav(label, fromPath, toPath, navigateFn) {
    await page.goto(`${BASE}/#${fromPath}`);
    await page.waitForTimeout(800);
    await scrollDown(page, 500);
    const before = await getScrollTop(page);
    await navigateFn(page);
    await page.waitForTimeout(600);
    const after = await getScrollTop(page);
    const pass = after === 0;
    results.push({ label, before, after, pass });
    console.log(`${pass ? '✅' : '❌'} ${label}: scrollTop before=${before} after=${after}`);
  }

  // 1. Navigate to /welcome (public page) and check if scroll resets
  await page.goto(`${BASE}/#/welcome`);
  await page.waitForTimeout(800);
  // Not logged in, so most routes redirect. Test what we can.

  // Test: welcome -> login (click login link if present, else direct navigate)
  await testNav(
    'welcome → login (direct)',
    '/welcome', '/login',
    async (p) => { await p.goto(`${BASE}/#/login`); }
  );

  await testNav(
    'login → welcome (direct)',
    '/login', '/welcome',
    async (p) => { await p.goto(`${BASE}/#/welcome`); }
  );

  await testNav(
    'login → register (direct)',
    '/login', '/register',
    async (p) => { await p.goto(`${BASE}/#/register`); }
  );

  await testNav(
    'register → login (direct)',
    '/register', '/login',
    async (p) => { await p.goto(`${BASE}/#/login`); }
  );

  await testNav(
    'terms → login (direct)',
    '/terms', '/login',
    async (p) => { await p.goto(`${BASE}/#/login`); }
  );

  // Also verify the main element exists on each screen
  for (const route of ['/welcome', '/login', '/register', '/terms']) {
    await page.goto(`${BASE}/#${route}`);
    await page.waitForTimeout(500);
    const hasMain = await page.evaluate(() => !!document.querySelector('main.flex-1'));
    const scrollable = await page.evaluate(() => {
      const el = document.querySelector('main.flex-1');
      if (!el) return false;
      const s = window.getComputedStyle(el);
      return s.overflowY === 'auto' || s.overflowY === 'scroll';
    });
    console.log(`🔍 ${route}: main.flex-1 exists=${hasMain}, scrollable=${scrollable}`);
  }

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`\nSummary: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    console.log('\nFailed cases:');
    results.filter(r => !r.pass).forEach(r => console.log(`  ❌ ${r.label}`));
    process.exit(1);
  }

  await browser.close();
  process.exit(0);
})();

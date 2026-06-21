import { chromium } from 'playwright';

const BASE = 'http://localhost:5174';
const MOBILE = { width: 390, height: 844 };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/#/login`);
  await page.waitForTimeout(1500);

  const bodyHTML = await page.evaluate(() => document.body.innerHTML.substring(0, 3000));
  console.log('=== BODY HTML ===');
  console.log(bodyHTML);

  const allScrollable = await page.evaluate(() => {
    const candidates = [];
    document.querySelectorAll('*').forEach(el => {
      const s = window.getComputedStyle(el);
      if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
        candidates.push({
          tag: el.tagName,
          className: el.className.toString().substring(0, 80),
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          scrollTop: el.scrollTop,
        });
      }
    });
    return candidates;
  });

  console.log('\n=== SCROLLABLE ELEMENTS ===');
  allScrollable.forEach(e => console.log(e));

  await browser.close();
})();

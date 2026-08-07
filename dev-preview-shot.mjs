import { chromium } from 'playwright-core';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1700, height: 900 } });
const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push(String(err)));

await page.goto('http://localhost:5173/dev-preview.html', { waitUntil: 'networkidle' });
// Espera a que Leaflet realmente pinte tiles (o al menos monte el contenedor)
await page.waitForTimeout(3000);
await page.screenshot({ path: 'dev-preview-shot.png', fullPage: true });

console.log('ERRORS:', JSON.stringify(errors, null, 2));
await browser.close();

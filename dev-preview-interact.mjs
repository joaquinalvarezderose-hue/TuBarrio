import { chromium } from 'playwright-core';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1700, height: 900 } });
await page.goto('http://localhost:5173/dev-preview.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

function mapBoxFor(label) {
  return page.locator(`span:text-is("${label}")`).locator('xpath=following-sibling::div[1]');
}

// --- Doble click para zoom-in en la vista fullscreen (touchZoom/doubleClickZoom = interactive) ---
const fullscreenBox = mapBoxFor('fullscreen(interactive) - hoyo corto');
const box2 = await fullscreenBox.boundingBox();
await page.screenshot({ path: 'shot-before-dblclick.png', clip: box2 });

await page.mouse.dblclick(box2.x + box2.width / 2, box2.y + box2.height / 2);
await page.waitForTimeout(700);
await page.screenshot({ path: 'shot-after-dblclick.png', clip: box2 });

// --- Doble click en el mapa compacto (no interactivo): no deberia hacer nada ---
const compactBox = mapBoxFor('compact - hoyo corto (145yd)');
const box3 = await compactBox.boundingBox();
await page.screenshot({ path: 'shot-before-dblclick-compact.png', clip: box3 });
await page.mouse.dblclick(box3.x + box3.width / 2, box3.y + box3.height / 2);
await page.waitForTimeout(700);
await page.screenshot({ path: 'shot-after-dblclick-compact.png', clip: box3 });

await browser.close();
console.log('done');

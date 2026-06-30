const { chromium } = require('playwright');

const BASE_URL = process.env.GAME_URL || 'http://localhost:3000';

(async () => {
  const errors = [];
  const browser = await chromium.launch();
  const page = await browser.newPage();

  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  await page.click('#play-btn');
  await page.waitForTimeout(1500);

  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.press('Space');
  await page.waitForTimeout(1000);

  await browser.close();

  if (errors.length > 0) {
    console.error('Browser errors:');
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
  }

  console.log('Smoke test passed with no runtime errors.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

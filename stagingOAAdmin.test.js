const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 800  // so you can clearly see every click
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('Opening staging portal...');
    await page.goto('https://portal.staging.ecdconnect.co.za/');

    // === 1. Login (fixed email!) ===
    await page.waitForSelector('input[name="email"]', { timeout: 15000 });
    await page.fill('input[name="email"]', 'OAAdmin');
    await page.fill('input[name="password"]', 'ECDConnect123!');
    await page.getByRole('button', { name: 'Log in' }).click();

    console.log('Logging in...');
    await page.waitForLoadState('networkidle'); // waits until page is fully settled
    await page.waitForTimeout(3000);            // extra safety

    // === 2. Click Practitioners ===
    console.log('Clicking Practitioners tab');
    await page.getByRole('link', { name: 'Practitioners' }).click();
    await page.waitForTimeout(2500);

    // === 3. Click Administrators ===
    console.log('Clicking Administrators tab');
    await page.getByRole('link', { name: 'Administrators' }).click();
    await page.waitForTimeout(2500);

    // === 4. Click Documents (sidebar) ===
    console.log('Clicking Documents');
    await page.getByRole('link', { name: 'Documents' }).click();
    await page.waitForTimeout(2500);

    // === 5. Click Content Management ===
    console.log('Clicking Content Management');
    await page.getByRole('link', { name: 'Content Management' }).click();
    await page.waitForTimeout(2500);

    // === 6. Click Messaging ===
    console.log('Clicking Messaging');
    await page.getByRole('link', { name: 'Messaging' }).click();
    await page.waitForTimeout(2500);

    console.log('All clicks completed successfully!');
    console.log('Browser will stay open for 2 minutes so you can continue manually');
    await page.waitForTimeout(120000);

  } catch (error) {
    console.error('Error:', error.message);
    await page.screenshot({ path: 'clicks-only-error.png', fullPage: true });
  } finally {
    await browser.close();
  }
})();
const { chromium } = require('playwright');

// Sign in/Login
// login
// Prac_155




(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Step 1: Go to landing page
    await page.goto('https://ecdconnect-qa-app.azurewebsites.net/', { timeout: 1000000 });

    // Step 2: Click the "Log in" button (landing page)
    await page.getByRole('button', { name: 'Log in' }).click();

    // Step 3: Wait for login form
    await page.waitForSelector('input[name="username"]', { timeout: 1000000 });

    // Step 4: Enter credentials
    await page.fill('input[name="username"]', 'Prac_155');
    await page.fill('input[name="password"]', 'Tester_12');

    // Step 5: Click login button on login page
    await page.click('#gtm-login');

    // Step 6: Wait for navigation or dashboard element
    await page.waitForNavigation({ timeout: 10000 });

    console.log('Login successful!');
  } catch (error) {
    console.error('Login failed:', error);
  } finally {
    await browser.close();
  }
})();

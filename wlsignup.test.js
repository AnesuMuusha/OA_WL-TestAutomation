const { chromium } = require("playwright");

// Optimized login automation
(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();

  try {
    // Step 1: Navigate to landing page
    console.log("Navigating to landing page...");
    await page.goto("https://whitelabel-qa-portal.azurewebsites.net/", {
      timeout: 15000,
      waitUntil: "domcontentloaded",
    });
    console.log("Landing page loaded successfully");

     
    // Step 2: Fill email field
    await page.waitForSelector('input[name="email"]', { timeout: 10000 });
    await page.fill('input[name="email"]', "WLAdmin");

    // Step 3: Fill password field
    await page.waitForSelector('input[name="password"]', { timeout: 10000 });
    await page.fill('input[name="password"]', "ECDConnect123!");

    // Step 4: Click login button
    await page.waitForSelector('button.bg-secondary:has-text("Log in")', { timeout: 10000 });
    await page.click('button.bg-secondary:has-text("Log in")');

    // Step 5: Click Practitioners tab
    // await page.waitForSelector('a[href="/users/practitioners"]', { timeout: 10000 });
    // await page.click('a[href="/users/practitioners"]');

     // With explicit wait :       Click Practitioner:
await page.locator('a[href="/users/practitioners"]').waitFor({ state: 'visible' });
await page.locator('a[href="/users/practitioners"]').click();


    // Step 6: Click "Add Practitioners"
    await page.waitForSelector('p:has-text("Add Practitioners")', { timeout: 10000 });
    await page.click('p:has-text("Add Practitioners") >> xpath=..');

    // Step 7: Click "Add one Practitioner"
    await page.waitForSelector('p:has-text("Add one Practitioner")', { timeout: 10000 });
    await page.click('p:has-text("Add one Practitioner") >> xpath=..');

    // Step 8: Fill first name field
    await page.waitForSelector('input[name="firstName"]', { timeout: 10000 });
    await page.fill('input[name="firstName"]', 'WLQACamera004');

    // Step 9: Fill surname field
    await page.waitForSelector('input[name="surname"]', { timeout: 10000 });
    await page.fill('input[name="surname"]', 'QA');

    // Step 10: Fill phone number field
    await page.waitForSelector('input[name="phoneNumber"]', { timeout: 10000 });
    await page.fill('input[name="phoneNumber"]', '0719270935');

    // Step 11: Click Passport button
    await page.waitForSelector('button:has(p:has-text("Passport"))', { timeout: 10000 });
    await page.click('button:has(p:has-text("Passport"))');

    // Step 12: Fill ID number field
    await page.waitForSelector('input[name="idNumber"]', { timeout: 10000 });
    await page.fill('input[name="idNumber"]', 'WLQACamera004');

    // Step 13: Select Practitioner's coach
    await page.waitForSelector('label:has-text("Practitioner\'s coach")', { timeout: 50000 });
    await page.click('label:has-text("Practitioner\'s coach")');

    // Step 14: Click Save button
    await page.waitForSelector('button.bg-quatenary:has-text("Save")', { timeout: 100000 });
    await page.click('button.bg-quatenary:has-text("Save")');
    console.log("Practitioner saved successfully");

    // Step 15: Ensure the practitioner list is loaded
    await page.waitForSelector('table', { timeout: 15000 });

    // Step 16: Find and click the row containing the practitioner's name
    const practitionerName = 'WLQACamera004';
    console.log(`Searching for practitioner: ${practitionerName}`);
    await page.waitForSelector(`td:has-text("${practitionerName}")`, { timeout: 15000 });

    const rows = await page.$$(`td:has-text("${practitionerName}")`);
    console.log(`Found ${rows.length} rows with name ${practitionerName}`);

    const rowSelector = `tr:has(td:has-text("${practitionerName}"))`;
    await page.waitForSelector(`${rowSelector} button`, { timeout: 10000 });
    await page.click(`${rowSelector} button`);
    console.log(`Clicked button for practitioner: ${practitionerName}`);

    await page.waitForTimeout(5000);

    // Step 17: Click Resend Invitation button
    console.log("Waiting for 'Resend Invitation' element...");
    await page.waitForSelector('p.font-semibold.text-sm.text-white.font-body:has-text("Resend Invitation")', { timeout: 15000, state: 'visible' });
    
    try {
      await page.click('p.font-semibold.text-sm.text-white.font-body:has-text("Resend Invitation")', { timeout: 5000 });
      console.log("Clicked 'Resend Invitation' <p> directly");
    } catch (directClickError) {
      console.log("Direct click on <p> failed, trying parent element...");
      await page.click('p.font-semibold.text-sm.text-white.font-body:has-text("Resend Invitation") >> xpath=..', { timeout: 5000 });
      console.log("Clicked parent of 'Resend Invitation' <p>");
    }

    // Step 18: Copy the invite URL
    await page.waitForSelector('p.font-semibold.text-sm.text-secondary.font-body:has-text("Copy the invite URL")', { timeout: 10000 });
    await page.click('p.font-semibold.text-sm.text-secondary.font-body:has-text("Copy the invite URL")');
    console.log("Clicked 'Copy the invite URL'");

    // Step 19: Retrieve the copied URL and navigate
    const copiedUrl = await page.evaluate(() => navigator.clipboard.readText());
    console.log(`Copied URL: ${copiedUrl}`);
    const newPage = await context.newPage();
    await newPage.goto(copiedUrl);
    await newPage.waitForLoadState('domcontentloaded');
    console.log("Navigated to invite URL");

    // ALL ACTIONS BELOW SHOULD USE newPage (not page)
    
    // Click "Enter Passport number instead" button
    await newPage.getByText('Enter Passport number instead').click();
    console.log("Clicked 'Enter Passport number instead'");

    // Enter passport number
    await newPage.locator('input[name="username"]').fill('WLQACamera004');
    console.log("Filled passport number");

    // Enter phone number
    await newPage.locator('input[name="cellphone"]').fill('0719270935');
    console.log("Filled phone number");

    // Accept terms and conditions
    await newPage.locator('input[name="termsAndConditionsAccepted"]').check();
    console.log("Checked terms and conditions");

    // Accept data permission agreement
    await newPage.locator('input[name="dataPermissionAgreementAccepted"]').check();
    console.log("Checked data permission agreement");

    // Click Next
    await newPage.getByText('Next').click();
    console.log("Clicked Next");

    await newPage.waitForTimeout(3000);

    // Click "Create a username"
    await newPage.getByText('Create a username').click();
    console.log("Clicked 'Create a username'");

    // Enter username
    await newPage.getByPlaceholder('e.g. Nothando_123').fill('WLQACamera004');
    console.log("Filled username");

    // Enter password
    await newPage.locator('input[name="password"]').fill('Tester_12');
    console.log("Filled password");

    await newPage.waitForTimeout(3000);

    // FIXED: Click Sign up - use newPage and better selectors
    console.log("Attempting to click Sign up button...");
    try {
      // Method 1: Wait for and click by text
      await newPage.getByText('Sign up').waitFor({ state: 'visible', timeout: 10000 });
      await newPage.getByText('Sign up').click();
      console.log("Clicked Sign up button (method 1)");
    } catch (error1) {
      console.log("Method 1 failed, trying method 2...");
      try {
        await newPage.locator('button.bg-quatenary:has-text("Sign up")').click();
        console.log("Clicked Sign up button (method 2)");
      } catch (error2) {
        console.log("Method 2 failed, trying method 3...");
        try {
          await newPage.locator('button:has(p:has-text("Sign up"))').click();
          console.log("Clicked Sign up button (method 3)");
        } catch (error3) {
          console.log("All methods failed, trying force click...");
          await newPage.locator('p:has-text("Sign up")').click({ force: true });
          console.log("Force clicked Sign up");
        }
      }
    }
    
    await newPage.waitForTimeout(3000);

    // Login with created credentials
    await newPage.locator('input[name="username"]').fill('WLQACamera004');
    console.log("Filled login username");

    await newPage.locator('input[name="password"]').fill('Tester_12');
    console.log("Filled login password");

    await newPage.waitForTimeout(3000);

    // Click login button
    await newPage.locator('#gtm-login').click();
    console.log("Clicked login button");

    await newPage.waitForTimeout(3000);

    console.log("Automation completed successfully");
  } catch (error) {
    console.error("Automation failed:", error);
    console.log("Current URL:", page.url());

    try {
      await page.screenshot({ path: "error-screenshot.png" });
      console.log("Error screenshot saved");
    } catch (screenshotError) {
      console.log("Could not save screenshot:", screenshotError);
    }
  } finally {
    await browser.close();
    console.log("Browser closed");
  }
})();
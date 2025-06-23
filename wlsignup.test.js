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
    await page.waitForSelector('a[href="/users/practitioners"]', { timeout: 10000 });
    await page.click('a[href="/users/practitioners"]');

    // Step 6: Click "Add Practitioners"
    await page.waitForSelector('p:has-text("Add Practitioners")', { timeout: 10000 });
    await page.click('p:has-text("Add Practitioners") >> xpath=..');

    // Step 7: Click "Add one Practitioner"
    await page.waitForSelector('p:has-text("Add one Practitioner")', { timeout: 10000 });
    await page.click('p:has-text("Add one Practitioner") >> xpath=..');

    // Step 8: Fill first name field
    await page.waitForSelector('input[name="firstName"]', { timeout: 10000 });
    await page.fill('input[name="firstName"]', 'QAQMAutomationWL003');

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
    await page.fill('input[name="idNumber"]', 'QAQMAutomationWL003');

    // Step 13: Select Practitioner's coach
    await page.waitForSelector('label:has-text("Practitioner\'s coach")', { timeout: 50000 });
    await page.click('label:has-text("Practitioner\'s coach")');

    // Step 14: Click Save button
    await page.waitForSelector('button.bg-quatenary:has-text("Save")', { timeout: 100000 });
    await page.click('button.bg-quatenary:has-text("Save")');
    console.log("Practitioner saved successfully");

    // Step 15: Ensure the practitioner list is loaded
    await page.waitForSelector('table', { timeout: 15000 }); // Adjust if list isn't in a <table>

    // Step 16: Find and click the row containing the practitioner's name
    const practitionerName = 'QAQMAutomationWL003';
    console.log(`Searching for practitioner: ${practitionerName}`);
    await page.waitForSelector(`td:has-text("${practitionerName}")`, { timeout: 15000 });

    // Debug: Log number of matching rows
    const rows = await page.$$(`td:has-text("${practitionerName}")`);
    console.log(`Found ${rows.length} rows with name ${practitionerName}`);

    // Click the button in the specific practitioner's row
    const rowSelector = `tr:has(td:has-text("${practitionerName}"))`;
    await page.waitForSelector(`${rowSelector} button`, { timeout: 10000 });
    await page.click(`${rowSelector} button`);
    console.log(`Clicked button for practitioner: ${practitionerName}`);


    await page.waitForTimeout(5000) 



    // Step 17: Click Resend Invitation button
    console.log("Waiting for 'Resend Invitation' element...");
    await page.waitForSelector('p.font-semibold.text-sm.text-white.font-body:has-text("Resend Invitation")', { timeout: 15000, state: 'visible' });
    
    // Debug: Verify element is clickable
    const isClickable = await page.$eval('p.font-semibold.text-sm.text-white.font-body:has-text("Resend Invitation")', el => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none';
    });
    console.log(`Is 'Resend Invitation' clickable? ${isClickable}`);

    // Try clicking the <p> directly
    try {
      await page.click('p.font-semibold.text-sm.text-white.font-body:has-text("Resend Invitation")', { timeout: 5000 });
      console.log("Clicked 'Resend Invitation' <p> directly");
    } catch (directClickError) {
      console.log("Direct click on <p> failed, trying parent element...");
      // Fallback: Click the parent element (e.g., button or div containing the <p>)
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
    await newPage.waitForLoadState('domcontentloaded'); // Ensure the new page is fully loaded
    console.log("Navigated to invite URL");

    // Click Passport button
    await page.getByText('Enter Passport number instead').waitFor({ state: 'visible' });


    //Enter passport number
    await page.locator('input[name="username"]').clear();
    await page.locator('input[name="username"]').fill('QAQMAutomationWL003');
    

    //Enter phone number:
    await page.locator('input[name="cellphone"]').fill('0719270935');

    //Click
    await page.locator('input[name="termsAndConditionsAccepted"]').click();

    //Click
    await page.locator('input[name="dataPermissionAgreementAccepted"]').check()

    //Next
    await page.getByText('Next').click();


      // Click
    await page.getByText('Create a username').click();
    
    // Username

await page.getByPlaceholder('e.g. Nothando_123').fill('QAQMAutomationWL003');

// Option 1: Fill by name attribute (most reliable)
await page.locator('input[name="password"]').fill('Tester_12');

// Option 1: Click by text content (most reliable)
await page.getByText('Sign up').click();
    
// Option 1: Fill by name attribute (most reliable)
await page.locator('input[name="username"]').fill('QAQMAutomationWL003');

// Option 1: Fill by name attribute (most reliable)
await page.locator('input[name="password"]').fill('Tester_12');


// Option 1: Click by button ID (most reliable)
await page.locator('#gtm-login').click();

// Option 1: Click by text content (most reliable)
await page.getByText('Start').click();

await page.waitForTimeout(3000); // Wait 10 seconds before closing  

    console.log("Automation completed successfully");
  } catch (error) {
    console.error("Automation failed:", error);
    console.log("Current URL:", page.url());

    // Quick error screenshot
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
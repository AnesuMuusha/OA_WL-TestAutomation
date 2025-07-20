const { chromium } = require("playwright");

// Helper function to check if we're still on the right page
async function checkPageState(currentPage, expectedUrlPattern) {
  const url = currentPage.url();
  console.log(`Current URL: ${url}`);
  
  if (url.includes('dynadot') || url.includes('expired') || url.includes('view-user')) {
    console.log("⚠️  Page redirected to unexpected location - possible session timeout");
    await currentPage.screenshot({ path: "unexpected-redirect.png" });
    return false;
  }
  return true;
}

// Helper function to wait and verify page is ready
async function waitForPageReady(currentPage, timeout = 10000) {
  try {
    await currentPage.waitForLoadState('networkidle', { timeout });
    await currentPage.waitForTimeout(2000); // Additional stability wait
    return await checkPageState(currentPage);
  } catch (error) {
    console.log("Page ready check failed:", error.message);
    return false;
  }
}

// Helper function for safe clicking with multiple fallback methods
async function safeClick(page, selector, options = {}) {
  const maxRetries = 3;
  const timeout = options.timeout || 10000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (page.isClosed()) {
        throw new Error("Page is closed");
      }

      console.log(`Attempt ${attempt}: Clicking ${selector}`);

      // Wait for element to be visible and stable
      await page.waitForSelector(selector, {
        state: "visible",
        timeout: timeout / maxRetries,
      });

      // Check if element is still there before clicking
      const elementCount = await page.locator(selector).count();
      if (elementCount === 0) {
        throw new Error("Element not found");
      }

      await page.click(selector, { timeout: 3000 });
      console.log(`Successfully clicked: ${selector}`);
      return;
    } catch (error) {
      console.log(`Attempt ${attempt} failed: ${error.message}`);

      if (attempt === maxRetries) {
        // Try alternative methods on final attempt
        try {
          console.log("Trying force click as last resort...");
          await page.click(selector, { force: true, timeout: 2000 });
          return;
        } catch (forceError) {
          throw new Error(`All click attempts failed for ${selector}: ${error.message}`);
        }
      }

      // Wait before retry
      await page.waitForTimeout(1000 * attempt);
    }
  }
}

// Helper function for safe form filling with validation
async function safeFill(page, selector, value, options = {}) {
  if (page.isClosed()) {
    throw new Error("Page is closed");
  }

  await page.waitForSelector(selector, { timeout: options.timeout || 10000 });
  await page.fill(selector, value);

  // Verify the value was filled
  const filledValue = await page.inputValue(selector);
  if (filledValue !== value) {
    console.warn(`Warning: Expected "${value}" but got "${filledValue}"`);
  }

  console.log(`Filled ${selector} with: ${value}`);
}

// Optimized login automation
(async () => {
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ 
  permissions: ['clipboard-read', 'clipboard-write'],
  viewport: { width: 1280, height: 720 }
});
const page = await context.newPage();
let newPage;

// Set up dialog handlers
context.on("dialog", async (dialog) => {
  console.log(`Dialog detected: ${dialog.type()} - ${dialog.message()}`);

  switch (dialog.type()) {
    case "beforeunload":
      await dialog.dismiss();
      break;
    case "confirm":
      await dialog.accept();
      break;
    default:
      await dialog.accept();
  }
});

// Set up page error handlers
page.on("pageerror", (error) => {
  console.log(`Page error: ${error.message}`);
});

page.on("close", () => {
  console.log("Main page closed");
});

try {
// Step 1: Navigate to landing page
console.log("=== Step 1: Navigating to landing page ===");
await page.goto("https://whitelabel-qa-portal.azurewebsites.net/", {
timeout: 15000,
waitUntil: "domcontentloaded",
});
console.log("Landing page loaded successfully");

// Verify we're on the right page
if (!(await checkPageState(page))) {
  throw new Error("Failed to load landing page correctly");
}

// Step 2: Fill email field
console.log("=== Step 2: Filling email field ===");
await page.waitForSelector('input[name="email"]', { timeout: 10000 });
await safeFill(page, 'input[name="email"]', "WLAdmin");

// Step 3: Fill password field
console.log("=== Step 3: Filling password field ===");
await page.waitForSelector('input[name="password"]', { timeout: 10000 });
await safeFill(page, 'input[name="password"]', "ECDConnect123!");

// Step 4: Click login button
console.log("=== Step 4: Clicking login button ===");
await page.waitForSelector('button.bg-secondary:has-text("Log in")', { timeout: 15000 });
await safeClick(page, 'button.bg-secondary:has-text("Log in")');

// Wait for login to complete and verify
await page.waitForTimeout(5000);
if (!(await waitForPageReady(page))) {
  throw new Error("Login failed or page redirected unexpectedly");
}

// Step 5: Click Practitioners tab
console.log("=== Step 5: Navigating to Practitioners tab ===");
await page.waitForTimeout(10000);
await page.locator('a[href="/users/practitioners"]').waitFor({ state: 'visible' });
await page.locator('a[href="/users/practitioners"]').click();

// Verify practitioners page loaded
await page.waitForTimeout(3000);
if (!(await waitForPageReady(page))) {
  throw new Error("Failed to load practitioners page");
}

// Step 6: Click "Add Practitioners"
console.log("=== Step 6: Clicking Add Practitioners ===");
await page.waitForSelector('p:has-text("Add Practitioners")', { timeout: 10000 });
await safeClick(page, 'p:has-text("Add Practitioners") >> xpath=..');

// Step 7: Click "Add one Practitioner"
console.log("=== Step 7: Clicking Add one Practitioner ===");
await page.waitForSelector('p:has-text("Add one Practitioner")', { timeout: 10000 });
await safeClick(page, 'p:has-text("Add one Practitioner") >> xpath=..');

// Step 8: Fill first name field
console.log("=== Step 8: Filling first name ===");
await page.waitForSelector('input[name="firstName"]', { timeout: 10000 });
await safeFill(page, 'input[name="firstName"]', 'WLIncomeAndExpense2');

// Step 9: Fill surname field
console.log("=== Step 9: Filling surname ===");
await page.waitForSelector('input[name="surname"]', { timeout: 10000 });
await safeFill(page, 'input[name="surname"]', 'QA');

// Step 10: Fill phone number field
console.log("=== Step 10: Filling phone number ===");
await page.waitForSelector('input[name="phoneNumber"]', { timeout: 10000 });
await safeFill(page, 'input[name="phoneNumber"]', '0719270935');

// Step 11: Click Passport button
console.log("=== Step 11: Selecting Passport option ===");
await page.waitForSelector('button:has(p:has-text("Passport"))', { timeout: 10000 });
await safeClick(page, 'button:has(p:has-text("Passport"))');

// Step 12: Fill ID number field
console.log("=== Step 12: Filling ID number ===");
await page.waitForSelector('input[name="idNumber"]', { timeout: 10000 });
await safeFill(page, 'input[name="idNumber"]', 'WLIncomeAndExpense2');

// Step 13: Select Practitioner's coach
console.log("=== Step 13: Selecting Practitioner's coach ===");
await page.waitForSelector('label:has-text("Practitioner\'s coach")', { timeout: 50000 });
await safeClick(page, 'label:has-text("Practitioner\'s coach")');

// Step 14: Click Save button
console.log("=== Step 14: Saving practitioner ===");
await page.waitForSelector('button.bg-quatenary:has-text("Save")', { timeout: 100000 });
await safeClick(page, 'button.bg-quatenary:has-text("Save")');
console.log("Practitioner saved successfully");

// Wait for save to complete
await page.waitForTimeout(5000);
if (!(await waitForPageReady(page))) {
  throw new Error("Save operation failed or page redirected");
}

// Step 15: Ensure the practitioner list is loaded
console.log("=== Step 15: Waiting for practitioner list ===");
await page.waitForSelector('table', { timeout: 15000 });

// Step 16: Find and click the row containing the practitioner's name
console.log("=== Step 16: Finding and clicking practitioner row ===");
const practitionerName = 'WLIncomeAndExpense2';
console.log(`Searching for practitioner: ${practitionerName}`);
await page.waitForSelector(`td:has-text("${practitionerName}")`, { timeout: 15000 });
const rows = await page.$$(`td:has-text("${practitionerName}")`);
console.log(`Found ${rows.length} rows with name ${practitionerName}`);
const rowSelector = `tr:has(td:has-text("${practitionerName}"))`;
await page.waitForSelector(`${rowSelector} button`, { timeout: 10000 });
await safeClick(page, `${rowSelector} button`);
console.log(`Clicked button for practitioner: ${practitionerName}`);
await page.waitForTimeout(5000);

// Step 17: Click Resend Invitation button
console.log("=== Step 17: Clicking Resend Invitation ===");
console.log("Waiting for 'Resend Invitation' element...");
await page.waitForSelector('p.font-semibold.text-sm.text-white.font-body:has-text("Resend Invitation")', { timeout: 15000, state: 'visible' });
try {
await safeClick(page, 'p.font-semibold.text-sm.text-white.font-body:has-text("Resend Invitation")');
console.log("Clicked 'Resend Invitation' <p> directly");
} catch (directClickError) {
console.log("Direct click on <p> failed, trying parent element...");
await safeClick(page, 'p.font-semibold.text-sm.text-white.font-body:has-text("Resend Invitation") >> xpath=..');
console.log("Clicked parent of 'Resend Invitation' <p>");
}

// Step 18: Copy the invite URL
console.log("=== Step 18: Copying invite URL ===");
await page.waitForSelector('p.font-semibold.text-sm.text-secondary.font-body:has-text("Copy the invite URL")', { timeout: 10000 });
await safeClick(page, 'p.font-semibold.text-sm.text-secondary.font-body:has-text("Copy the invite URL")');
console.log("Clicked 'Copy the invite URL'");

// Wait for clipboard to be populated
await page.waitForTimeout(2000);

// Step 19: Retrieve the copied URL and navigate
console.log("=== Step 19: Navigating to invite URL ===");
const copiedUrl = await page.evaluate(() => navigator.clipboard.readText());
console.log(`Copied URL: ${copiedUrl}`);

if (!copiedUrl || copiedUrl.length < 10) {
  throw new Error("Failed to copy invite URL or URL is invalid");
}

newPage = await context.newPage();

// Set up error handlers for new page
newPage.on("close", () => {
  console.log("New page closed");
});

newPage.on("pageerror", (error) => {
  console.log(`New page error: ${error.message}`);
});

await newPage.goto(copiedUrl);
await newPage.waitForLoadState('domcontentloaded');
console.log("Navigated to invite URL");

// Verify new page loaded correctly
if (!(await waitForPageReady(newPage))) {
  throw new Error("Failed to load invite URL page");
}

// ALL ACTIONS BELOW SHOULD USE newPage (not page)
console.log("=== Starting signup process on new page ===");

// Click "Enter Passport number instead" button
console.log("=== Clicking Enter Passport number instead ===");
await newPage.getByText('Enter Passport number instead').click();
console.log("Clicked 'Enter Passport number instead'");

// Enter passport number
console.log("=== Filling passport number ===");
await safeFill(newPage, 'input[name="username"]', 'WLIncomeAndExpense2');
console.log("Filled passport number");

// Enter phone number
console.log("=== Filling phone number ===");
await safeFill(newPage, 'input[name="cellphone"]', '0719270935');
console.log("Filled phone number");

// Accept terms and conditions
console.log("=== Accepting terms and conditions ===");
await newPage.locator('input[name="termsAndConditionsAccepted"]').check();
console.log("Checked terms and conditions");

// Accept data permission agreement
console.log("=== Accepting data permission agreement ===");
await newPage.locator('input[name="dataPermissionAgreementAccepted"]').check();
console.log("Checked data permission agreement");

// Click Next
console.log("=== Clicking Next ===");
await newPage.getByText('Next').click();
console.log("Clicked Next");
await newPage.waitForTimeout(3000);

// Verify page progressed
if (!(await waitForPageReady(newPage))) {
  throw new Error("Page failed to progress after Next");
}

// Click "Create a username"
console.log("=== Clicking Create a username ===");
await newPage.getByText('Create a username').click();
console.log("Clicked 'Create a username'");

// Enter username
console.log("=== Filling username ===");
await safeFill(newPage, 'input[placeholder="e.g. Nothando_123"]', 'WLIncomeAndExpense2');
console.log("Filled username");

// Enter password
console.log("=== Filling password ===");
await safeFill(newPage, 'input[name="password"]', 'Tester_12');
console.log("Filled password");
await newPage.waitForTimeout(3000);

// FIXED: Click Sign up - use newPage and better selectors
console.log("=== Attempting to click Sign up button ===");
let signupSuccess = false;
const signupMethods = [
  () => newPage.getByText('Sign up').click(),
  () => newPage.locator('button.bg-quatenary:has-text("Sign up")').click(),
  () => newPage.locator('button:has(p:has-text("Sign up"))').click(),
  () => newPage.locator('p:has-text("Sign up")').click({ force: true })
];

for (let i = 0; i < signupMethods.length; i++) {
  try {
    console.log(`Trying signup method ${i + 1}...`);
    if (i === 0) {
      await newPage.getByText('Sign up').waitFor({ state: 'visible', timeout: 10000 });
    }
    await signupMethods[i]();
    console.log(`✓ Sign up method ${i + 1} succeeded`);
    signupSuccess = true;
    break;
  } catch (error) {
    console.log(`✗ Sign up method ${i + 1} failed: ${error.message}`);
  }
}

if (!signupSuccess) {
  throw new Error("All sign up methods failed");
}

await newPage.waitForTimeout(3000);

// Verify signup completed
if (!(await waitForPageReady(newPage))) {
  throw new Error("Signup failed or page redirected unexpectedly");
}

// Login with created credentials
console.log("=== Logging in with created credentials ===");
await safeFill(newPage, 'input[name="username"]', 'WLIncomeAndExpense2');
console.log("Filled login username");

await safeFill(newPage, 'input[name="password"]', 'Tester_12');
console.log("Filled login password");
await newPage.waitForTimeout(3000);

// Click login button
console.log("=== Clicking login button ===");
await newPage.locator('#gtm-login').click();
console.log("Clicked login button");
await newPage.waitForTimeout(3000);

// Verify login completed
if (!(await waitForPageReady(newPage))) {
  throw new Error("Login failed or page redirected unexpectedly");
}

// Click Start button
console.log("=== Clicking Start button ===");
await newPage.getByText('Start').click();
console.log("Clicked Start button");

// Wait longer for the page to fully load
await newPage.waitForLoadState('networkidle');
await newPage.waitForTimeout(5000);
console.log("Starting post-login setup...");

// Wait for any loading indicators to disappear
try {
await newPage.waitForSelector('.loading', { state: 'hidden', timeout: 5000 });
} catch (e) {
// Loading selector might not exist, continue
console.log("No loading indicator found, continuing...");
}

// Try to find Principal with more specific waiting
console.log("=== Selecting Principal role ===");
try {
// Wait for the specific container structure to be visible
await newPage.waitForSelector('div.rounded-10:has-text("Principal")', { timeout: 15000 });
console.log("Principal container found");
// Click the Principal option
await newPage.locator('div.rounded-10:has-text("Principal")').click();
console.log("Selected Principal");
} catch (error) {
console.log("Principal selection failed, trying alternative selectors...");
// Alternative: Look for the text "I run a preschool" which should be unique
try {
await newPage.getByText('I run a preschool').click();
console.log("Selected Principal via 'I run a preschool' text");
} catch (error2) {
console.log("All Principal selection methods failed");
await newPage.screenshot({ path: "principal-selection-failed.png" });
throw error2;
}
}

// Verify principal selection completed
await newPage.waitForTimeout(3000);
if (!(await waitForPageReady(newPage))) {
  throw new Error("Principal selection failed or page redirected");
}

// Fill name
console.log("=== Filling school name ===");
await newPage.locator('input[name="name"]').waitFor({ state: 'visible' });
await newPage.locator('input[name="name"]').clear();
await safeFill(newPage, 'input[name="name"]', 'TestAuto');
console.log("Filled name");

// Click Next
console.log("=== Clicking Next after name ===");
await newPage.getByText('Next').waitFor({ state: 'visible' });
await newPage.getByText('Next').click();
console.log("Clicked Next after name");

// Verify page progressed
await newPage.waitForTimeout(3000);
if (!(await waitForPageReady(newPage))) {
  throw new Error("Failed to progress after filling name");
}

// Click Skip
console.log("=== Clicking Skip ===");
await newPage.getByText('Skip').waitFor({ state: 'visible' });
await newPage.getByText('Skip').click();
console.log("Clicked Skip");

// Verify skip completed
await newPage.waitForTimeout(3000);
if (!(await waitForPageReady(newPage))) {
  throw new Error("Failed to progress after skip");
}

// Click Add class - ADD PAGE STATE CHECK
console.log("=== Clicking Add class ===");
await newPage.getByText('Add class').waitFor({ state: 'visible' });
await newPage.getByText('Add class').click();
console.log("Clicked Add class");

// CRITICAL: Check if page is still valid after Add class
await newPage.waitForTimeout(3000);
const pageValid = await waitForPageReady(newPage);
if (!pageValid) {
throw new Error("Page redirected after clicking Add class - session may have expired");
}

// Drop down - ADD EXISTENCE CHECK
console.log("=== Looking for practitioner dropdown ===");
try {
await newPage.waitForSelector('text="Select a practitioner"', { timeout: 10000 });
await newPage.getByText('Select a practitioner').click();
console.log("Clicked practitioner dropdown");
} catch (dropdownError) {
console.log("Practitioner dropdown not found, checking page state...");
await checkPageState(newPage);
throw dropdownError;
}

await newPage.waitForTimeout(3000);

// Select practitioner - ADD ERROR HANDLING
console.log("=== Selecting practitioner ===");
try {
await newPage.click('svg:has(path[d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"])');
console.log("Selected practitioner");
} catch (practitionerError) {
console.log("Practitioner selection failed, trying alternative...");
// Try clicking the first available option
try {
  await newPage.click('div[role="option"]:first-child');
  console.log("Selected first available practitioner");
} catch (altError) {
  console.log("Alternative practitioner selection also failed");
  await newPage.screenshot({ path: "practitioner-selection-failed.png" });
  throw altError;
}
}

await newPage.waitForTimeout(3000);

// Click yes
console.log("=== Clicking Yes ===");
await newPage.click('div.font-body.p-3.text-sm.font-medium:has-text("Yes")');
console.log("Clicked Yes");

// Click Save
console.log("=== Clicking Save ===");
await newPage.getByText('Save').click();
console.log("Clicked Save");
await newPage.waitForTimeout(3000);

// Check page state before continuing
if (!(await waitForPageReady(newPage))) {
throw new Error("Page state invalid after Save");
}

// Next
console.log("=== Clicking Next after Save ===");
await newPage.getByRole('button', { name: 'Next' }).click();
console.log("Clicked Next");
await newPage.waitForTimeout(3000);

// Skip
console.log("=== Clicking Skip again ===");
await newPage.getByText('Skip').click();
console.log("Clicked Skip");
await newPage.waitForTimeout(3000);

// IMPROVED: Close button with comprehensive error handling and page state checks
console.log("=== Attempting to close popup ===");

// First, verify we're still on the right page
if (!(await checkPageState(newPage))) {
console.log("Cannot proceed with close - page redirected");
return;
}

// Try multiple close button strategies
let closeSuccess = false;
const closeMethods = [
() => newPage.getByRole('button', { name: 'Close' }).click({ timeout: 5000 }),
() => newPage.getByTestId('close-button').click({ timeout: 5000 }),
() => newPage.click('button:has-text("Close")', { timeout: 5000 }),
() => newPage.click('button.bg-quatenary:has-text("Close")', { timeout: 5000 }),
() => newPage.click('[aria-label="Close"]', { timeout: 5000 }),
() => newPage.keyboard.press('Escape'), // Try ESC key as fallback
];

for (let i = 0; i < closeMethods.length; i++) {
try {
console.log(`Trying close method ${i + 1}...`);
await closeMethods[i]();
console.log(`✓ Close method ${i + 1} succeeded`);
closeSuccess = true;
break;
} catch (error) {
console.log(`✗ Close method ${i + 1} failed: ${error.message}`);

// Check if page redirected during close attempt
if (!(await checkPageState(newPage))) {
console.log("Page redirected during close attempt");
break;
}
}
}

if (!closeSuccess) {
console.log("All close methods failed, taking screenshot...");
await newPage.screenshot({ path: "close-failed-final.png" });

// Try to continue anyway - maybe the popup closed automatically
console.log("Continuing despite close failure...");
}

// Verify page state after close
await newPage.waitForTimeout(2000);
if (!(await checkPageState(newPage))) {
console.log("Page redirected after close attempt");
return;
}

// FIXED: Continue with newPage for all remaining actions
console.log("=== Continuing with classroom setup ===");

// Click classroom tab
console.log("=== Clicking Classroom tab ===");
await newPage.getByRole('heading', { name: 'Classroom' }).click();
console.log("Clicked Classroom tab");

// Click class1
console.log("=== Clicking Class 1 ===");
await newPage.getByText('Class 1').click();
console.log("Clicked Class 1");
await newPage.waitForTimeout(1000);

// See children button
console.log("=== Clicking See children button ===");
await newPage.getByRole('button', { name: 'See children' }).click();
console.log("Clicked See children");
await newPage.waitForTimeout(1000);

// add child
console.log("=== Adding a child ===");
await newPage.getByRole('button', { name: 'Add a child' }).click();
console.log("Clicked Add a child");
await newPage.waitForTimeout(1000);

// add name
console.log("=== Filling child's first name ===");
await safeFill(newPage, 'input[placeholder="First name"]', 'Gerald');

// add surname
console.log("=== Filling child's surname ===");
await safeFill(newPage, 'input[placeholder="Surname/Family name"]', 'Jaz');

// click drop down:
console.log("=== Selecting class for child ===");
await newPage.getByRole('button', { name: 'Select class' }).click();

// Select class 1
await newPage.getByText('Class 1').click();
console.log("Selected Class 1 for child");

// 5 second
await newPage.waitForTimeout(3000);

// Next
console.log("=== Clicking Next after child details ===");
await newPage.getByRole('button', { name: 'Next' }).click();

// Fill form
console.log("=== Starting child registration form ===");
// await newPage.getByText("Fill in child's registration form").click();
await newPage.click('button.cursor-pointer.inline-flex.items-center.border-2.border-solid.shadow-sm.text-sm.font-semibold.justify-center.outline-none.border-quatenary.text-quatenary.bg-white.py-2\\.5.px-17.rounded-15.mt-4:has(p:text("Fill in child’s registration form"))');
console.log("Clicked Fill in child's registration form");

// Check
await newPage.getByText("Personal information agreement").click();
console.log("Clicked Personal information agreement");

// Yes:
await newPage.getByText("Yes").click();
console.log("Clicked Yes for agreement");

// Next
await newPage.getByText("Next").click({ force: true });
console.log("Clicked Next after agreement");

// FIXED: Day dropdown - use exact text matching
console.log("=== Setting birth date - Day ===");
await newPage.getByText("Day").click();
await newPage.getByRole('menuitem', { name: '2', exact: true }).click();
console.log("Selected day 2");
await newPage.waitForTimeout(1000);

// FIXED: Month dropdown - use exact text matching
console.log("=== Setting birth date - Month ===");
await newPage.getByText("Month").click();
await newPage.getByRole('menuitem', { name: 'Feb', exact: true }).click();
console.log("Selected February");
await newPage.waitForTimeout(1000);

// FIXED: Year dropdown - more specific locator
console.log("=== Setting birth date - Year ===");
await newPage.getByText("Year").click();
await newPage.getByRole('menuitem', { name: '2024', exact: true }).click();
console.log("Selected year 2024");
await newPage.waitForTimeout(1000);

// next
console.log("=== Proceeding after birth date ===");
await newPage.getByText("Next").click();
await newPage.waitForTimeout(1000);

// next
console.log("=== Continuing form ===");
await newPage.getByText("Next").click();
await newPage.waitForTimeout(1000);

// next
console.log("=== Moving to parent details ===");
await newPage.getByText("Next").click();
await newPage.waitForTimeout(1000);

// drop down
console.log("=== Selecting relationship ===");
await newPage.getByText("Select relationship").click();
await newPage.waitForTimeout(1000);

// click:
await newPage.getByText("Mother").click();
console.log("Selected Mother relationship");

// Name
console.log("=== Filling parent details ===");
await safeFill(newPage, 'input[placeholder="First name"]', "Musa");

// surname
await safeFill(newPage, 'input[placeholder="Surname/family name"]', "Smith");

// number:
await safeFill(newPage, 'input[placeholder="E.g. 082 345 6789"]', "0719374857");

// next:
console.log("=== Proceeding to address ===");
await newPage.getByText("Next").click();

// code
console.log("=== Filling address details ===");
await safeFill(newPage, 'input[placeholder="E.g. 0122"]', "3452");
await newPage.getByPlaceholder('E.g. 203 Oak Apartments, 11 Green Road, Mamelodi East').click();

// click:
await newPage.getByRole('button', { name: 'Next' }).click();
console.log("Clicked Next after address");

// next
await newPage.getByRole('button', { name: 'Next' }).click();
console.log("Proceeding to emergency contact");

// name
console.log("=== Filling emergency contact ===");
await safeFill(newPage, 'input[placeholder="First name"]', 'Salam');

// surname
await safeFill(newPage, 'input[placeholder="Surname/family name"]', 'Page');

// number
await safeFill(newPage, 'input[name="phoneNumber"]', '0711234567');
await newPage.waitForTimeout(1000);

// yes
console.log("=== Confirming emergency contact ===");
await newPage.locator('div.bg-secondaryAccent2').getByText('Yes').click();
console.log("Clicked Yes for emergency contact");
await newPage.waitForTimeout(1000);

// save
console.log("=== Saving child registration ===");
await newPage.getByRole('button', { name: 'Save' }).click();
console.log("Clicked Save for child registration");
await newPage.waitForTimeout(1000);

// FIXED: Final close button with comprehensive error handling
console.log("=== Attempting final close ===");
let finalCloseSuccess = false;
const finalCloseMethods = [
  () => newPage.getByTestId('close-button').click({ timeout: 5000 }),
  () => newPage.getByRole('button', { name: 'Close' }).click({ timeout: 3000 }),
  () => newPage.click('button:has-text("Close")', { timeout: 3000 }),
  () => newPage.click('button.bg-quatenary:has-text("Close")', { timeout: 3000 }),
  () => newPage.getByTestId('close-button').click({ force: true }),
  () => newPage.keyboard.press('Escape')
];

for (let i = 0; i < finalCloseMethods.length; i++) {
  try {
    console.log(`Trying final close method ${i + 1}...`);
    if (i === 0) {
      // For the first method, wait for the element to be visible
      const closeButton = newPage.getByTestId('close-button');
      await closeButton.waitFor({ state: 'visible', timeout: 5000 });
    }
    await finalCloseMethods[i]();
    console.log(`✓ Final close method ${i + 1} succeeded`);
    finalCloseSuccess = true;
    break;
  } catch (error) {
    console.log(`✗ Final close method ${i + 1} failed: ${error.message}`);
  }
}

if (!finalCloseSuccess) {
  console.log("All final close methods failed, taking screenshot...");
  await newPage.screenshot({ path: "final-close-failed.png" });
  console.log("Continuing despite final close failure...");
} else {
  console.log("Final close button clicked successfully");
}

await newPage.waitForTimeout(3000); // Wait 3 seconds before closing

console.log("🎉 Automation completed successfully! 🎉");
console.log("Summary:");
console.log("✓ Created practitioner: WLIncomeAndExpense2");
console.log("✓ Set up preschool: TestAuto");
console.log("✓ Added class with practitioner");
console.log("✓ Added child: Gerald Jaz");
console.log("✓ Completed full registration flow");

} catch (error) {
console.error("❌ Automation failed:", error);

// Enhanced error reporting with detailed diagnostics
console.log("\n=== ERROR DIAGNOSTICS ===");
console.log(`Error type: ${error.name}`);
console.log(`Error message: ${error.message}`);
console.log(`Timestamp: ${new Date().toISOString()}`);

// Take screenshots from both pages if they exist
try {
if (page && !page.isClosed()) {
const url = page.url();
console.log("Main page URL:", url);
await page.screenshot({ path: "error-main-page.png" });
console.log("📸 Main page screenshot saved: error-main-page.png");
}
} catch (e) {
console.log("Could not screenshot main page:", e.message);
}

try {
if (typeof newPage !== 'undefined' && newPage && !newPage.isClosed()) {
const url = newPage.url();
console.log("New page URL:", url);
await newPage.screenshot({ path: "error-new-page.png" });
console.log("📸 New page screenshot saved: error-new-page.png");

// Check if it's a session timeout
if (url.includes('dynadot') || url.includes('expired')) {
console.log("🚨 SESSION EXPIRED - The application session timed out");
console.log("💡 Recommendations:");
console.log("   - Try running the script faster");
console.log("   - Check if session timeout can be increased");
console.log("   - Verify application is accessible");
}
}
} catch (e) {
console.log("Could not screenshot new page:", e.message);
}

// Additional debugging information
console.log("\n=== DEBUGGING INFO ===");
console.log("Browser version:", await browser.version());
console.log("User agent:", await page.evaluate(() => navigator.userAgent));

} finally {
console.log("\n=== CLEANUP ===");
try {
  if (newPage && !newPage.isClosed()) {
    await newPage.close();
    console.log("✓ New page closed");
  }
} catch (e) {
  console.log("Error closing new page:", e.message);
}

try {
  if (page && !page.isClosed()) {
    await page.close();
    console.log("✓ Main page closed");
  }
} catch (e) {
  console.log("Error closing main page:", e.message);
}

await browser.close();
console.log("✓ Browser closed");
console.log("=== AUTOMATION FINISHED ===");
}
})();
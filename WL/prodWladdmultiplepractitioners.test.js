const { chromium } = require("playwright");
const { test } = require("@playwright/test")
const JSZip = require("jszip")
const fs = require("fs")
const path = require("path")
const SCREENSHOTS_DIR = path.join(__dirname, "screenshots")
const DOWNLOADS_DIR = path.join(__dirname, "downloads")
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })
fs.mkdirSync(DOWNLOADS_DIR, { recursive: true })
const { logGeneratedUsername } = require("../usernameLog")

// ⚠️  PRODUCTION. This creates real practitioner records in the live white-label
// portal and the final "Add & invite users" click sends real invitation SMS to
// every phone number in the uploaded sheet. Run deliberately, not on a whim.
const PROD_BASE_URL = "http://portal-whitelabel.ecdconnect.co.za"

// How many practitioners each run uploads in one batch.
const BULK_COUNT = 5

// Persistent counter so every run gets a fresh block of unique identifiers.
// Names run "BulkUsers000001", "BulkUsers000002", ... always incrementing by 1,
// so a run never collides with users a previous run already added.
// Separate file from the QA test so prod and QA number independently.
const BULK_USERS_COUNTER_FILE = path.join(__dirname, ".wl-prod-bulkusers-counter.json")
function nextBulkUsersBlock(count) {
  let start = 1
  try {
    start = JSON.parse(fs.readFileSync(BULK_USERS_COUNTER_FILE, "utf8")).count || 1
  } catch {
    // first run – counter file doesn't exist yet
  }
  fs.writeFileSync(BULK_USERS_COUNTER_FILE, JSON.stringify({ count: start + count }, null, 2))

  const rows = []
  for (let n = start; n < start + count; n++) {
    const id = "BulkUsers" + String(n).padStart(6, "0")
    rows.push({
      typeOfIdentification: "passport",
      idNumber: "",
      passport: id,
      firstName: id,
      surname: "BulkUser",
      // 07728374xx, incrementing by 1 in lock-step with the id
      cellphone: String(772837485 + (n - 1)).padStart(10, "0"),
      coachId: "",
    })
  }
  rows.forEach((r) => logGeneratedUsername("Prod", "WL/prodWladdmultiplepractitioners", r.passport))
  return { start, ids: rows.map((r) => r.passport), rows }
}

function xmlEscape(s) {
  return String(s).replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]))
}

// Surgically rewrite ONLY xl/worksheets/sheet1.xml ("Practitioner Template") in
// the template the app just served us, leaving every other part of the workbook
// byte-for-byte identical – the app's import validator (VALIDATEPRACTITIONERIMPORTSHEET)
// rejects a fully re-serialised workbook. String cells use inline strings so we
// never have to touch sharedStrings.xml either.
async function buildUploadFile(downloadedTemplatePath, rows, outPath) {
  const zip = await JSZip.loadAsync(fs.readFileSync(downloadedTemplatePath))
  const sheetPath = "xl/worksheets/sheet1.xml"
  const sheetFile = zip.file(sheetPath)
  if (!sheetFile) throw new Error(`${sheetPath} not found in downloaded template`)
  const original = await sheetFile.async("string")

  const headerMatch = original.match(/<row r="1">.*?<\/row>/s)
  if (!headerMatch) throw new Error("Could not locate header row in sheet1.xml")
  const headerRow = headerMatch[0]

  const cell = (ref, value) =>
    `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`

  let body = ""
  rows.forEach((r, i) => {
    const rn = i + 2
    body +=
      `<row r="${rn}">` +
      cell(`A${rn}`, r.typeOfIdentification) + // A: Type of identification
      cell(`C${rn}`, r.passport) +             // C: Passport
      cell(`D${rn}`, r.firstName) +            // D: First name
      cell(`E${rn}`, r.surname) +              // E: Surname
      cell(`F${rn}`, r.cellphone) +           // F: Cellphone number
      `</row>`
  })

  let updated = original.replace(
    /<sheetData>.*?<\/sheetData>/s,
    `<sheetData>${headerRow}${body}</sheetData>`
  )
  updated = updated.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:G${rows.length + 1}"/>`)

  zip.file(sheetPath, updated)
  const buf = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  fs.writeFileSync(outPath, buf)
  return outPath
}

// Helper function to check if we're still on the right page
async function checkPageState(currentPage, expectedUrlPattern) {
  const url = currentPage.url();
  console.log(`Current URL: ${url}`);

  if (url.includes('dynadot') || url.includes('expired') || url.includes('view-user')) {
    console.log("⚠️  Page redirected to unexpected location - possible session timeout");
    await currentPage.screenshot({ path: path.join(SCREENSHOTS_DIR, "unexpected-redirect.png") });
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

// Try a list of selectors in order, click the first one that works.
async function safeClickAny(page, selectors, options = {}) {
  let lastError;
  for (const selector of selectors) {
    try {
      await safeClick(page, selector, options);
      return selector;
    } catch (error) {
      lastError = error;
      console.log(`Selector "${selector}" did not work, trying next...`);
    }
  }
  throw new Error(`None of the selectors worked: ${selectors.join(" | ")} (${lastError && lastError.message})`);
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

// PROD admin portal – add multiple practitioners via bulk template
test("WL/prodWladdmultiplepractitioners", async () => {
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  permissions: ['clipboard-read', 'clipboard-write'],
  viewport: { width: 1280, height: 720 },
  acceptDownloads: true,
});
const page = await context.newPage();

// Unique per run – e.g. "BulkUsers000001", "BulkUsers000002", ...
const { start: bulkUsersStart, ids: bulkUsersIds, rows: bulkUsersRows } = nextBulkUsersBlock(BULK_COUNT);
const bulkUsersId = "prod-BulkUsers" + String(bulkUsersStart).padStart(6, "0"); // first id of this run's block, used for file/screenshot names
console.log(`⚠️  PRODUCTION run against ${PROD_BASE_URL}`);
console.log(`This run's bulk users block: ${bulkUsersIds[0]} .. ${bulkUsersIds[bulkUsersIds.length - 1]}`);

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
await page.goto(`${PROD_BASE_URL}/`, {
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

// Step 7: Click "Add multiple Practitioners" (instead of "Add one Practitioner")
console.log("=== Step 7: Clicking Add multiple Practitioners ===");
await safeClickAny(page, [
  'p:has-text("Add multiple Practitioners") >> xpath=..',
  'p:has-text("Add multiple practitioners") >> xpath=..',
  'p:has-text("Add Multiple Practitioners") >> xpath=..',
  'button:has-text("Add multiple Practitioners")',
  'text=/add multiple practitioners/i',
], { timeout: 15000 });

await page.waitForTimeout(2000);

// Step 8: Download the template – we always verify the download template functionality.
// The download can be served from the current page or from a popup, so listen on the
// whole browser context rather than a single page, and give it a generous timeout.
console.log("=== Step 8: Downloading the bulk-upload template ===");
const downloadPromise = context.waitForEvent('download', { timeout: 60000 });
await safeClickAny(page, [
  'button:has-text("Download the template")',
  'a:has-text("Download the template")',
  'button:has-text("Download template")',
  'a:has-text("Download template")',
  'text=/download.*template/i',
], { timeout: 15000 });

const download = await downloadPromise;
const suggestedName = download.suggestedFilename();
console.log(`Template download started – suggested filename: ${suggestedName}`);

const savedTemplatePath = path.join(DOWNLOADS_DIR, `${bulkUsersId}-${suggestedName}`);
await download.saveAs(savedTemplatePath);
console.log(`Template saved to: ${savedTemplatePath}`);

// Step 9: Verify the downloaded template
console.log("=== Step 9: Verifying downloaded template ===");
if (!fs.existsSync(savedTemplatePath)) {
  throw new Error(`Template was not saved to disk at ${savedTemplatePath}`);
}
const stats = fs.statSync(savedTemplatePath);
if (stats.size === 0) {
  throw new Error("Downloaded template file is empty (0 bytes)");
}
console.log(`✓ Template downloaded and non-empty (${stats.size} bytes)`);

await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${bulkUsersId}-download-template.png`) });

// Step 10: Fill and upload the template (Step 2 on screen: "Upload excel file").
// Rows are generated fresh each run from the counter, using the template the app
// just served us as the base, so every run adds BULK_COUNT brand-new practitioners.
console.log("=== Step 10: Building upload file from downloaded template ===");
const uploadFilePath = path.join(DOWNLOADS_DIR, `${bulkUsersId}-upload.xlsx`);
await buildUploadFile(savedTemplatePath, bulkUsersRows, uploadFilePath);
console.log(`Built ${uploadFilePath} with ${bulkUsersRows.length} rows: ${bulkUsersIds.join(", ")}`);

console.log("=== Step 11: Uploading filled template ===");
// The dropzone hides a real <input type="file"> behind "Browse my computer".
const fileInput = page.locator('input[type="file"]');
await fileInput.waitFor({ state: 'attached', timeout: 10000 });
await fileInput.setInputFiles(uploadFilePath);
console.log(`Attached file: ${uploadFilePath}`);
await page.waitForTimeout(2000);

// "Check file" validates the upload before it is committed.
await safeClickAny(page, [
  'button:has-text("Check file")',
  'p:has-text("Check file") >> xpath=..',
  'text=/check file/i',
], { timeout: 15000 }).catch((e) => console.log(`"Check file" not clicked: ${e.message}`));
await page.waitForTimeout(3000);

// The app reports "<N> users ready for upload" once the file validates. If it
// instead shows an "issues with your upload" list, fail with those details.
const readyBanner = page.getByText(/users ready for upload/i);
const issuesBanner = page.getByText(/issues with your upload/i);
try {
  await Promise.race([
    readyBanner.waitFor({ state: 'visible', timeout: 20000 }),
    issuesBanner.waitFor({ state: 'visible', timeout: 20000 }),
  ]);
} catch {
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${bulkUsersId}-check-file-no-banner.png`) });
  throw new Error('Neither "N users ready for upload" nor an issues list appeared after Check file');
}

if (await issuesBanner.isVisible().catch(() => false)) {
  const issuesText = await issuesBanner.locator('xpath=ancestor::*[self::div][1]').innerText().catch(() => "");
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${bulkUsersId}-upload-issues.png`) });
  throw new Error(`Template validation reported issues:\n${issuesText}`);
}

const readyText = (await readyBanner.innerText()).trim();
console.log(`✓ Validation banner: "${readyText}"`);
if (!readyText.includes(String(bulkUsersRows.length))) {
  console.log(`⚠️  Expected ${bulkUsersRows.length} users ready, banner says: "${readyText}"`);
}

// Final confirm – button reads "Add & invite users" (disabled until validation passes).
// ⚠️  On prod this sends real invitation SMS to every number in the sheet.
await safeClickAny(page, [
  'button:has-text("Add & invite users")',
  'button:has-text("Add & Invite users")',
  'button:has-text("Add and invite users")',
  'button:has-text("Add practitioners")',
  'button:has-text("Add users")',
  'button.bg-quatenary:has-text("Add")',
  'button:has-text("Add")',
], { timeout: 15000 });

// Wait for the add/invite request to finish (button shows a spinner while it runs).
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(8000);
await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${bulkUsersId}-upload-result.png`) });
console.log(`✓ Upload step completed – added ${bulkUsersIds.join(", ")}`);

// Step 12: Verify at least the first new practitioner shows in the Practitioners list.
console.log("=== Step 12: Verifying new practitioners in the list ===");
await page.goto(`${PROD_BASE_URL}/users/practitioners`, {
  waitUntil: "domcontentloaded",
  timeout: 20000,
});
await page.waitForTimeout(3000);
const firstNewId = bulkUsersIds[0];
try {
  await page.waitForSelector(`text=${firstNewId}`, { timeout: 15000 });
  console.log(`✓ Found ${firstNewId} in the practitioners list`);
} catch {
  // The list is paginated/searchable – try a search box if present.
  const search = page.locator('input[type="search"], input[placeholder*="earch"]').first();
  if (await search.isVisible().catch(() => false)) {
    await search.fill(firstNewId);
    await page.waitForTimeout(3000);
    await page.waitForSelector(`text=${firstNewId}`, { timeout: 10000 });
    console.log(`✓ Found ${firstNewId} in the practitioners list (via search)`);
  } else {
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${bulkUsersId}-verify-list-failed.png`) });
    throw new Error(`Could not confirm ${firstNewId} in the practitioners list after bulk add`);
  }
}
await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${bulkUsersId}-practitioners-list.png`) });

console.log("🎉 PROD Bulk users – add multiple practitioners completed successfully! 🎉");
console.log("Summary:");
console.log(`✓ Logged in to PROD admin portal as WLAdmin`);
console.log(`✓ Opened Practitioners → Add Practitioners → Add multiple Practitioners`);
console.log(`✓ Downloaded template: ${savedTemplatePath} (${stats.size} bytes)`);
console.log(`✓ Uploaded ${bulkUsersRows.length} practitioners: ${bulkUsersIds.join(", ")}`);
console.log(`✓ Run block starts at: ${bulkUsersId}`);

} catch (error) {
console.error("❌ Automation failed:", error);

console.log("\n=== ERROR DIAGNOSTICS ===");
console.log(`Error type: ${error.name}`);
console.log(`Error message: ${error.message}`);
console.log(`Timestamp: ${new Date().toISOString()}`);

try {
if (page && !page.isClosed()) {
const url = page.url();
console.log("Page URL:", url);
await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${bulkUsersId}-error.png`) });
console.log(`📸 Screenshot saved: ${bulkUsersId}-error.png`);
}
} catch (e) {
console.log("Could not screenshot page:", e.message);
}

} finally {
console.log("\n=== CLEANUP ===");
try {
  if (page && !page.isClosed()) {
    await page.close();
    console.log("✓ Page closed");
  }
} catch (e) {
  console.log("Error closing page:", e.message);
}

await browser.close();
console.log("✓ Browser closed");
console.log("=== AUTOMATION FINISHED ===");
}
})

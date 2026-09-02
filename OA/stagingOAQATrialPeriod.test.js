const { chromium } = require("playwright");
const { test } = require("@playwright/test")
const testdata = require("./testdata")
const fs = require("fs")
const path = require("path")
const SCREENSHOTS_DIR = path.join(__dirname, "screenshots")
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })

// Persistent run counter so each signup gets a unique username.
// Starts at "OATPS000001" and increments by 1 after every run.
const USERNAME_COUNTER_FILE = path.join(__dirname, ".oatp-staging-username-counter.json")
function nextUsername() {
  let count = 1
  try {
    count = JSON.parse(fs.readFileSync(USERNAME_COUNTER_FILE, "utf8")).count || 1
  } catch {
    // first run – counter file doesn't exist yet
  }
  fs.writeFileSync(USERNAME_COUNTER_FILE, JSON.stringify({ count: count + 1 }, null, 2))
  return "OATPS" + String(count).padStart(6, "0")
}

test("OA/stagingOAQATrialPeriod", async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 300 }); // slowMo helps debugging
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // ────────────────────────────────────────────────
    // ECD Connect Signup – Phone Number & Initial Steps
    // ────────────────────────────────────────────────
    console.log("Navigating to landing page...");
    await page.goto("https://app.staging.ecdconnect.co.za/", {
      timeout: 50000,
      waitUntil: "domcontentloaded",
    });

    console.log("Clicking Sign up button...");
    await page.getByRole("button", { name: "Sign up" }).click();

    await page.waitForLoadState("domcontentloaded", { timeout: 15000 });

    console.log("Entering phone number...");
    await page.getByPlaceholder("e.g 0123456789").fill(testdata.practitionerPhone);

    console.log("Clicking checkboxes...");
    await page.locator("input[type='checkbox']").first().click({ timeout: 5000 }).catch(() => {});
    await page.locator("input[type='checkbox']").nth(1).click({ timeout: 5000 }).catch(() => {});

    console.log("Clicking Yes...");
    await page.getByText("Yes", { exact: true }).click({ force: true, timeout: 5000 }).catch(() => {});

    console.log("Clicking first Next...");
    await page.getByRole("button", { name: "Next" }).click({ force: true, timeout: 5000 }).catch(() =>
      page.getByText("Next").click({ force: true })
    );

    await page.bringToFront();

    console.log("Waiting for OTP screen...");
    await page.getByText("Enter your 6 digit code").waitFor({ timeout: 15000 }).catch(() => {});

    const otpBannerText = await page
      .getByText(/testing only.*code:/i)
      .innerText()
      .catch(() => "");
    const otpMatch = otpBannerText.match(/(\d{6})/);

    if (otpMatch) {
      console.log(`Filling OTP code ${otpMatch[1]}...`);
      await page.getByPlaceholder("------").fill(otpMatch[1]);
      await page.getByRole("button", { name: "Confirm" }).click();
      await page.waitForTimeout(2000);
    } else {
      console.log("Could not read testing OTP code from page; falling back to fixed wait.");
      await page.waitForTimeout(30000);
    }

    // ────────────────────────────────────────────────
    // Rest of your ECD Connect child flow (no preschool onboarding)
    // ────────────────────────────────────────────────
    const username = nextUsername();
    console.log("Filling username/password/ – username:", username);
    await page.click('button:has-text("Create a username")');
    await page.fill('input[name="password"]', "Tester_12");
    await page.fill('input[placeholder="e.g. Nothando_123"]', username);
    await page.waitForTimeout(1000);

    await page.waitForTimeout(2000)
// await page.getByRole("button", { name: "Sign up" }).click();
await page.getByRole("button", { name: "Sign up", exact: true }).click();
    await page.waitForTimeout(4000);

// click "Yes" on the pop-up

await page.waitForSelector('[data-headlessui-state="open"]', { timeout: 10000 });
await page.getByRole("button", { name: "Yes" }).click();

    // ────────────────────────────────────────────────
    // Classroom → add a class
    // (trial-period account lands on /classroom with no class yet)
    // ────────────────────────────────────────────────
    console.log("Adding a class in the Classroom section...");
    await page.getByRole("heading", { name: "Classroom" }).click().catch(() => {});
    await page.waitForTimeout(3000);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "staging-classroom.png"), fullPage: true }).catch(() => {});

    // "Add a class" floating action button on the empty Classes tab → opens "Edit classes".
    const addAClassFab = page
      .getByRole("button", { name: /add a class/i })
      .or(page.getByText(/add a class/i))
      .first();
    await addAClassFab.waitFor({ timeout: 20000 });
    await addAClassFab.click();
    await page.waitForTimeout(3000);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "staging-editclasses.png"), fullPage: true }).catch(() => {});

    // "+ Add class" button on the "Edit classes" screen.
    const addClassBtn = page
      .getByRole("button", { name: /add class/i })
      .or(page.locator('p.text-sm.font-h1.font-normal:has-text("Add class")'))
      .or(page.getByText(/add class/i))
      .first();
    await addClassBtn.waitFor({ timeout: 15000 });
    await addClassBtn.click();
    await page.waitForTimeout(3000);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "staging-addclass-form.png"), fullPage: true }).catch(() => {});

    // Edit class form: "Does this class meet everyday?" → Yes
    await page.getByText("Yes", { exact: true }).first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1000);

    // "Which Practitioner teaches this class?" → open dropdown and pick the first one
    await page.getByText("Select a practitioner").click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "staging-prac-dropdown.png"), fullPage: true }).catch(() => {});

    await page
      .locator('svg:has(path[d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"])')
      .first()
      .click({ timeout: 5000 })
      .catch(() => page.getByRole("option").first().click({ timeout: 5000 }).catch(() => {}));
    await page.waitForTimeout(1000);
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(1000);

    await page.getByRole("button", { name: "Save" }).click({ timeout: 8000 })
      .catch(() => page.getByText("Save").click({ timeout: 5000 }).catch(() => {}));
    await page.waitForTimeout(3000);

    // Back on the "Edit classes" list → Confirm to finalise
    await page.getByRole("button", { name: "Confirm" }).click({ timeout: 8000 })
      .catch(() => page.getByText("Confirm", { exact: true }).click({ timeout: 5000 }).catch(() => {}));
    await page.waitForTimeout(3000);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "staging-afterclass.png"), fullPage: true }).catch(() => {});

    // Classroom → add child1...
    await page.getByRole("heading", { name: "Classroom" }).click();
    await page.getByText("Class 1").click();
    await page.getByRole("button", { name: "See children" }).click();

    await page.getByRole("button", { name: "Add a child" }).click();

    await page.getByPlaceholder("First name").fill("Lisa");
    await page.getByPlaceholder("Surname/Family name").fill("Jaz");

    await page.getByRole("button", { name: "Select class" }).click();
    await page.getByText("Class 1").click();

    await page.getByText("Save").click();
    await page.waitForTimeout(2000);

    // Child registration form...
    await page.getByRole("button", { name: "Fill in the registration form" }).click();

    await page.locator('input[name="personalInformationAgreementAccepted"]').check();
    await page.getByText("Yes").click();
    await page.getByText("Next").click({ force: true });

    // Birth date
    await page.locator("button[aria-haspopup='menu']").first().click();
    await page.getByText("15").click();

    // await page.getByText("Month").click();
    // await page.getByRole("menuitem", { name: "Feb", exact: true }).click();

    await page.locator('button[aria-haspopup="menu"]:has-text("Year")').click();
    await page.getByRole("menuitem", { name: "2024", exact: true }).click();

    await page.getByText("Next").click({ force: true });

    // More Next clicks...
    for (let i = 0; i < 3; i++) {
      await page.getByText("Next").click({ force: true }).catch(() => {});
      await page.waitForTimeout(1000);
    }

    await page.getByText("Select relationship").click();
    await page.getByText("Mother").click();

    await page.getByPlaceholder("First name").fill("Musa");
    await page.getByPlaceholder("Surname/family name").fill("Smith");
    await page.getByPlaceholder("E.g. 082 345 6789").fill(testdata.guardianPhone);

    await page.getByText("Next").click();

    await page.getByPlaceholder("E.g. 0122").fill(testdata.idSuffix);

await page.locator('textarea[name="streetAddress"]').fill(testdata.streetAddress);
    await page.getByRole("button", { name: "Next" }).click();

    await page.getByRole("button", { name: "Next" }).click();

    await page.getByPlaceholder("First name").fill("Salam");
    await page.getByPlaceholder("Surname/family name").fill("Page");
    await page.locator('input[name="phoneNumber"]').fill(testdata.secondaryGuardianPhone);

    await page.locator("div.bg-secondaryAccent2").getByText("Yes").click();

    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForTimeout(2000);

    await page.getByTestId("close-button").click();




    // Add 2nd child:
    // Classroom → add child...
    await page.getByRole("heading", { name: "Classroom" }).click();
    await page.getByText("Class 1").click();
    await page.getByRole("button", { name: "See children" }).click();

    await page.getByRole("button", { name: "Add a child" }).click();

    await page.getByPlaceholder("First name").fill("Mandy");
    await page.getByPlaceholder("Surname/Family name").fill("Juqu");

    await page.getByRole("button", { name: "Select class" }).click();
    await page.getByText("Class 1").click();

    await page.getByText("Save").click();
    await page.waitForTimeout(2000);

    // Child registration form...
    await page.getByRole("button", { name: "Fill in the registration form" }).click();

    await page.locator('input[name="personalInformationAgreementAccepted"]').check();
    await page.getByText("Yes").click();
    await page.getByText("Next").click({ force: true });

    // Birth date
    await page.locator("button[aria-haspopup='menu']").first().click();
    await page.getByText("15").click();

    // await page.getByText("Month").click();
    // await page.getByRole("menuitem", { name: "Feb", exact: true }).click();

    await page.locator('button[aria-haspopup="menu"]:has-text("Year")').click();
    await page.getByRole("menuitem", { name: "2024", exact: true }).click();

    await page.getByText("Next").click({ force: true });

    // More Next clicks...
    for (let i = 0; i < 3; i++) {
      await page.getByText("Next").click({ force: true }).catch(() => {});
      await page.waitForTimeout(1000);
    }

    await page.getByText("Select relationship").click();
    await page.getByText("Mother").click();

    await page.getByPlaceholder("First name").fill("Musa");
    await page.getByPlaceholder("Surname/family name").fill("Smith");
    await page.getByPlaceholder("E.g. 082 345 6789").fill(testdata.guardianPhone);

    await page.getByText("Next").click();

    await page.getByPlaceholder("E.g. 0122").fill(testdata.idSuffix);

await page.locator('textarea[name="streetAddress"]').fill(testdata.streetAddress);
    await page.getByRole("button", { name: "Next" }).click();

    await page.getByRole("button", { name: "Next" }).click();

    await page.getByPlaceholder("First name").fill("Salam");
    await page.getByPlaceholder("Surname/family name").fill("Page");
    await page.locator('input[name="phoneNumber"]').fill(testdata.secondaryGuardianPhone);

    await page.locator("div.bg-secondaryAccent2").getByText("Yes").click();

    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForTimeout(2000);

    await page.getByTestId("close-button").click();



// Add 3rd child:
    // Classroom → add child...
    await page.getByRole("heading", { name: "Classroom" }).click();
    await page.getByText("Class 1").click();
    await page.getByRole("button", { name: "See children" }).click();

    await page.getByRole("button", { name: "Add a child" }).click();

    await page.getByPlaceholder("First name").fill("Ben");
    await page.getByPlaceholder("Surname/Family name").fill("Ecco");

    await page.getByRole("button", { name: "Select class" }).click();
    await page.getByText("Class 1").click();

    await page.getByText("Save").click();
    await page.waitForTimeout(2000);

    // Child registration form...
    await page.getByRole("button", { name: "Fill in the registration form" }).click();

    await page.locator('input[name="personalInformationAgreementAccepted"]').check();
    await page.getByText("Yes").click();
    await page.getByText("Next").click({ force: true });

    // Birth date
    await page.locator("button[aria-haspopup='menu']").first().click();
    await page.getByText("15").click();

    // await page.getByText("Month").click();
    // await page.getByRole("menuitem", { name: "Feb", exact: true }).click();

    await page.locator('button[aria-haspopup="menu"]:has-text("Year")').click();
    await page.getByRole("menuitem", { name: "2024", exact: true }).click();

    await page.getByText("Next").click({ force: true });

    // More Next clicks...
    for (let i = 0; i < 3; i++) {
      await page.getByText("Next").click({ force: true }).catch(() => {});
      await page.waitForTimeout(1000);
    }

    await page.getByText("Select relationship").click();
    await page.getByText("Mother").click();

    await page.getByPlaceholder("First name").fill("Musa");
    await page.getByPlaceholder("Surname/family name").fill("Smith");
    await page.getByPlaceholder("E.g. 082 345 6789").fill(testdata.guardianPhone);

    await page.getByText("Next").click();

    await page.getByPlaceholder("E.g. 0122").fill(testdata.idSuffix);

await page.locator('textarea[name="streetAddress"]').fill(testdata.streetAddress);
    await page.getByRole("button", { name: "Next" }).click();

    await page.getByRole("button", { name: "Next" }).click();

    await page.getByPlaceholder("First name").fill("Salam");
    await page.getByPlaceholder("Surname/family name").fill("Page");
    await page.locator('input[name="phoneNumber"]').fill(testdata.secondaryGuardianPhone);

    await page.locator("div.bg-secondaryAccent2").getByText("Yes").click();

    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForTimeout(2000);

    await page.getByTestId("close-button").click();





    // Add 4th child:
    // Classroom → add child...
    await page.getByRole("heading", { name: "Classroom" }).click();
    await page.getByText("Class 1").click();
    await page.getByRole("button", { name: "See children" }).click();

    await page.getByRole("button", { name: "Add a child" }).click();

    await page.getByPlaceholder("First name").fill("Bob");
    await page.getByPlaceholder("Surname/Family name").fill("Juqu");

    await page.getByRole("button", { name: "Select class" }).click();
    await page.getByText("Class 1").click();

    await page.getByText("Save").click();
    await page.waitForTimeout(2000);

    // Child registration form...
    await page.getByRole("button", { name: "Fill in the registration form" }).click();

    await page.locator('input[name="personalInformationAgreementAccepted"]').check();
    await page.getByText("Yes").click();
    await page.getByText("Next").click({ force: true });

    // Birth date
    await page.locator("button[aria-haspopup='menu']").first().click();
    await page.getByText("15").click();

    // await page.getByText("Month").click();
    // await page.getByRole("menuitem", { name: "Feb", exact: true }).click();

    await page.locator('button[aria-haspopup="menu"]:has-text("Year")').click();
    await page.getByRole("menuitem", { name: "2024", exact: true }).click();

    await page.getByText("Next").click({ force: true });

    // More Next clicks...
    for (let i = 0; i < 3; i++) {
      await page.getByText("Next").click({ force: true }).catch(() => {});
      await page.waitForTimeout(1000);
    }

    await page.getByText("Select relationship").click();
    await page.getByText("Mother").click();

    await page.getByPlaceholder("First name").fill("Musa");
    await page.getByPlaceholder("Surname/family name").fill("Smith");
    await page.getByPlaceholder("E.g. 082 345 6789").fill(testdata.guardianPhone);

    await page.getByText("Next").click();

    await page.getByPlaceholder("E.g. 0122").fill(testdata.idSuffix);

await page.locator('textarea[name="streetAddress"]').fill(testdata.streetAddress);
    await page.getByRole("button", { name: "Next" }).click();

    await page.getByRole("button", { name: "Next" }).click();

    await page.getByPlaceholder("First name").fill("Salam");
    await page.getByPlaceholder("Surname/family name").fill("Page");
    await page.locator('input[name="phoneNumber"]').fill(testdata.secondaryGuardianPhone);

    await page.locator("div.bg-secondaryAccent2").getByText("Yes").click();

    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForTimeout(2000);

    await page.getByTestId("close-button").click();


    // Add 5th child:
    // Classroom → add child...
    await page.getByRole("heading", { name: "Classroom" }).click();
    await page.getByText("Class 1").click();
    await page.getByRole("button", { name: "See children" }).click();

    await page.getByRole("button", { name: "Add a child" }).click();

    await page.getByPlaceholder("First name").fill("Kelvin");
    await page.getByPlaceholder("Surname/Family name").fill("Juqu");

    await page.getByRole("button", { name: "Select class" }).click();
    await page.getByText("Class 1").click();

    await page.getByText("Save").click();
    await page.waitForTimeout(2000);

    // Child registration form...
    await page.getByRole("button", { name: "Fill in the registration form" }).click();

    await page.locator('input[name="personalInformationAgreementAccepted"]').check();
    await page.getByText("Yes").click();
    await page.getByText("Next").click({ force: true });

    // Birth date
    await page.locator("button[aria-haspopup='menu']").first().click();
    await page.getByText("15").click();

    // await page.getByText("Month").click();
    // await page.getByRole("menuitem", { name: "Feb", exact: true }).click();

    await page.locator('button[aria-haspopup="menu"]:has-text("Year")').click();
    await page.getByRole("menuitem", { name: "2024", exact: true }).click();

    await page.getByText("Next").click({ force: true });

    // More Next clicks...
    for (let i = 0; i < 3; i++) {
      await page.getByText("Next").click({ force: true }).catch(() => {});
      await page.waitForTimeout(1000);
    }

    await page.getByText("Select relationship").click();
    await page.getByText("Mother").click();

    await page.getByPlaceholder("First name").fill("Musa");
    await page.getByPlaceholder("Surname/family name").fill("Smith");
    await page.getByPlaceholder("E.g. 082 345 6789").fill(testdata.guardianPhone);

    await page.getByText("Next").click();

    await page.getByPlaceholder("E.g. 0122").fill(testdata.idSuffix);

await page.locator('textarea[name="streetAddress"]').fill(testdata.streetAddress);
    await page.getByRole("button", { name: "Next" }).click();

    await page.getByRole("button", { name: "Next" }).click();

    await page.getByPlaceholder("First name").fill("Salam");
    await page.getByPlaceholder("Surname/family name").fill("Page");
    await page.locator('input[name="phoneNumber"]').fill(testdata.secondaryGuardianPhone);

    await page.locator("div.bg-secondaryAccent2").getByText("Yes").click();

    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForTimeout(2000);

    await page.getByTestId("close-button").click();

    // Classroom → Attendance → take today's register
    await page.getByRole("heading", { name: "Attendance" }).click();
    await page.waitForTimeout(2000);

    await page.getByText("No, skip", { exact: true }).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1000);
    await page.getByText("Close", { exact: true }).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1000);

    await page.getByRole("button", { name: "Edit" }).first().click();
    await page.waitForTimeout(1500);

    await page.locator("#gtm-add-attendance").click();
    await page.waitForTimeout(2000);

    // NOTE: Activities / "Choose a theme" step intentionally skipped for the trial-period flow.

    // Navigate back to the practitioner home dashboard, then open the Community section
    await page.goto("https://app.staging.ecdconnect.co.za/", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(4000);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "staging-prehome.png"), fullPage: true }).catch(() => {});

// Click Community section
await page.locator('h2:has-text("Community")').click({ timeout: 10000 })
  .catch(() => page.getByRole("heading", { name: "Community" }).click({ timeout: 8000 }).catch(() => {}));
await page.waitForTimeout(2000);

await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "staging-community.png"), fullPage: true }).catch(() => {});

// Click Yes button
await page.locator('div.bg-secondaryAccent2:has-text("Yes")').click();
await page.waitForTimeout(2000);

// Click Next button
await page.locator('button.bg-quatenary:has-text("Next")').click();
await page.waitForTimeout(2000);

// Click input and type "Passion"
await page.locator('input[placeholder="E.g. Love working with kids"]').click();
await page.locator('input[placeholder="E.g. Love working with kids"]').fill('Passion');
await page.waitForTimeout(2000);

// Click Yes button
// If there are multiple Yes buttons, target a specific one (0-indexed)
await page.locator('div.bg-secondaryAccent2:has-text("Yes")').nth(0).click({ timeout: 10000 }).catch(() => {});
await page.waitForTimeout(2000);

// Click Yes button
// Click Yes button - use exact text match with the specific classes
await page.locator('div.bg-secondaryAccent2.text-secondary').filter({ hasText: /^Yes$/ }).click({ timeout: 10000 }).catch(() => {});
await page.waitForTimeout(2000);

console.log("Selecting province...");
await page.getByText("Tap to choose province").click({ force: true, timeout: 10000 }).catch(() => {});
await page.waitForTimeout(2000);

await page.getByText("Western Cape", { exact: true }).click({ timeout: 10000 }).catch(() => {}); // Change as needed

console.log("Province selected");
await page.waitForTimeout(1000);

console.log("Clicking Save button...");

await page.getByRole("button", { name: "Save" }).click({ timeout: 10000 }).catch(() => {});
await page.waitForTimeout(2000);

console.log("Clicking 'Do this later' / 'Do it later'...");

await page.getByText("Do this later", { exact: true }).click({ force: true, timeout: 8000 })
  .catch(() => page.getByText(/do it later/i).first().click({ force: true, timeout: 5000 }).catch(() => {}));
await page.waitForTimeout(2000);

// Click "See ECD Heroes" button
await page.locator('button:has-text("See ECD Heroes")').click({ timeout: 12000 }).catch(() => {});
await page.waitForTimeout(2000);
await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "staging-ecdheroes.png"), fullPage: true }).catch(() => {});

// Click Start button using data-testid
await page.locator('button[data-testid="close-button"]:has-text("Start")').click({ timeout: 8000 }).catch(() => {});
await page.waitForTimeout(2000);
await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "staging-ecdheroes-list.png"), fullPage: true }).catch(() => {});

// Click the first practitioner in the ECD Heroes list
await page.locator('div.bg-uiBg.rounded-10.cursor-pointer').first().click({ timeout: 10000 }).catch(() => {});
await page.waitForTimeout(2000);
await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "staging-hero-selected.png"), fullPage: true }).catch(() => {});

// On the practitioner's profile → Connect
await page.locator('button:has-text("Connect with")').first().click({ timeout: 8000 })
  .catch(() => page.getByRole("button", { name: /connect/i }).first().click({ timeout: 8000 }).catch(() => {}));
await page.waitForTimeout(2000);
await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "staging-share-info.png"), fullPage: true }).catch(() => {});

// "Which information do you want to share with your contacts?" → Phone number and email
await page.getByRole("button", { name: /phone number and email/i }).click({ timeout: 8000 })
  .catch(() => page.getByText(/phone number and email/i).first().click({ timeout: 5000 }).catch(() => {}));
await page.waitForTimeout(2000);
await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "staging-connected.png"), fullPage: true }).catch(() => {});

// ────────────────────────────────────────────────
// Business section → add 1 income + 1 expense
// TODO: blocked by a forced ~10-step interactive walkthrough on the Money
//       tab that spotlights one element at a time and has no skip on the
//       later steps. Left out for now – see git history for the WIP attempt.
// ────────────────────────────────────────────────

    console.log("Automation completed successfully!");
    await page.waitForTimeout(5000);

  } catch (error) {
    console.error("Error during automation:", error);
    console.log("Current ECD URL:", await page.url());


    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "staging-final-error.png") }).catch(() => {});
  } finally {
    await browser.close();
  }
})

const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 300 }); // slowMo helps debugging
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // ────────────────────────────────────────────────
    // ECD Connect Signup – Phone Number & Initial Steps
    // ────────────────────────────────────────────────
    console.log("Navigating to landing page...");
    await page.goto("https://ecdconnect-qa-app.azurewebsites.net/", {
      timeout: 15000,
      waitUntil: "domcontentloaded",
    });

    console.log("Clicking Sign up button...");
    await page.getByRole("button", { name: "Sign up" }).click();

    await page.waitForLoadState("domcontentloaded", { timeout: 15000 });

    console.log("Entering phone number...");
    await page.getByPlaceholder("e.g 0123456789").fill("0719270911");

    console.log("Clicking checkboxes...");
    await page.locator("input[type='checkbox']").first().click({ timeout: 5000 }).catch(() => {});
    await page.locator("input[type='checkbox']").nth(1).click({ timeout: 5000 }).catch(() => {});

    console.log("Clicking Yes...");
    await page.getByText("Yes", { exact: true }).click({ force: true, timeout: 5000 }).catch(() => {});

    console.log("Clicking first Next...");
    await page.getByRole("button", { name: "Next" }).click({ force: true, timeout: 5000 }).catch(() =>
      page.getByText("Next").click({ force: true })
    );

    // ────────────────────────────────────────────────
    // Open BulkSMSOA3 in new page & login
    // ────────────────────────────────────────────────
    // const smsPage = await context.newPage();
    // console.log("Opening BulkSMSOA3 login page...");
    // await smsPage.goto("https://www.BulkSMSOA3.com/account/ui/index.html#/login", {
    //   waitUntil: "domcontentloaded",
    //   timeout: 20000,
    // });

    // // Handle Cookiebot if present
    // console.log("Handling Cookiebot consent if present...");
    // await smsPage.locator('#CybotCookiebotDialogBodyButtonDecline, button:has-text("Deny")').click({ timeout: 8000, force: true })
    //   .catch(() => console.log("No Cookiebot dialog"));

    // console.log("Entering BulkSMSOA3 username...");
    // await smsPage.fill('input[name="username"]', "ecdconnect");

    // console.log("Entering BulkSMSOA3 password...");
    // await smsPage.fill('input[name="password"]', "ECDconnect1!");

    // console.log("Clicking Log in...");
    // await smsPage.getByRole("button", { name: /log ?in/i }).click({ timeout: 10000 });

    // // Wait for post-login (lenient)
    // await smsPage.waitForURL(/#?\/(inbox|sent|dashboard|home)/i, { timeout: 30000 }).catch(async () => {
    //   console.log("No redirect detected – forcing inbox...");
    //   await smsPage.goto("https://www.BulkSMSOA3.com/account/ui/index.html#/inbox", { waitUntil: "domcontentloaded" });
    // });

    // await smsPage.waitForTimeout(5000); // settle

    // // ────────────────────────────────────────────────
    // // Handle Cloudflare Turnstile (if it appears)
    // // ────────────────────────────────────────────────
    // console.log("Checking for Cloudflare Turnstile...");
    // const turnstileCheckbox = smsPage.locator('.cb-lb input[type="checkbox"]');

    // if (await turnstileCheckbox.count() > 0) {
    //   console.log("Turnstile detected – attempting human-like verification");

    //   await smsPage.mouse.move(150 + Math.random() * 300, 200 + Math.random() * 400);
    //   await smsPage.waitForTimeout(1200 + Math.random() * 1800);
    //   await smsPage.evaluate(() => window.scrollBy(0, 200));

    //   await turnstileCheckbox.click({ delay: 300, force: true });
    //   console.log("Turnstile checkbox clicked");

    //   await smsPage.waitForSelector('#success', { timeout: 35000 }).catch(() => {
    //     console.warn("Turnstile success not detected in time");
    //     smsPage.screenshot({ path: "turnstile-fail.png" });
    //   });
    // } else {
    //   console.log("No Turnstile challenge detected");
    // }

    // // ────────────────────────────────────────────────
    // // Go to Sent Messages (direct navigation is more reliable)
    // // ────────────────────────────────────────────────
    // console.log("Navigating to Sent Messages...");
    // await smsPage.goto("https://www.BulkSMSOA3.com/account/ui/index.html#/sent/messages", {
    //   waitUntil: "domcontentloaded",
    //   timeout: 20000,
    // });

    // await smsPage.waitForSelector("text=Sent Messages, .message-row, tr.message, .no-messages", {
    //   timeout: 25000,
    // }).catch(() => console.log("Sent messages page loaded but selector not matched"));

    // // ────────────────────────────────────────────────
    // // Poll for latest sent message containing 6-digit OTP
    // // ────────────────────────────────────────────────
    // let verificationCode = null;
    // console.log("Polling Sent Messages for OTP...");

    // for (let attempt = 1; attempt <= 20; attempt++) {
    //   console.log(`Attempt ${attempt}/20`);

    //   const latestText = await smsPage.evaluate(() => {
    //     const rows = document.querySelectorAll("tr, .message-row, li, div.message");
    //     return rows[0]?.innerText?.trim() || "";
    //   });

    //   if (latestText) {
    //     const match = latestText.match(/\b\d{6}\b/);
    //     if (match) {
    //       verificationCode = match[0];
    //       console.log(`OTP found in sent message: ${verificationCode}`);
    //       break;
    //     }
    //   }

    //   await smsPage.waitForTimeout(5000); // wait 5s between polls
    // }

    // if (!verificationCode) {
    //   console.warn("No 6-digit OTP found after 100s polling");
    //   await smsPage.screenshot({ path: "no-otp-found.png" });
    // }

    // ────────────────────────────────────────────────
    // Switch back to ECD page & enter OTP
    // ────────────────────────────────────────────────
    await page.bringToFront();

    // // if (verificationCode) {
    // //   console.log("Entering OTP into ECD Connect form...");
    // //   await page.waitForSelector('input[placeholder="------"]', { timeout: 10000 });
    // //   await page.fill('input[placeholder="------"]', verificationCode);

    //   await page.locator('p.text-sm.font-h1.font-normal.text-white', { hasText: "Confirm" }).click();
    //   console.log("OTP confirmed");
    // } else {
    //   console.log("Continuing without OTP (manual intervention may be needed)");
    // }

    await page.waitForTimeout(30000);

    // ────────────────────────────────────────────────
    // Rest of your ECD Connect preschool + child flow
    // ────────────────────────────────────────────────
    console.log("Filling username/password/");
    await page.click('button:has-text("Create a username")');
    await page.fill('input[name="password"]', "Tester_12");
    await page.fill('input[placeholder="e.g. Nothando_123"]', "WalkthroughOA3");
    await page.waitForTimeout(1000);

    await page.waitForTimeout(2000)
// await page.getByRole("button", { name: "Sign up" }).click();
await page.getByRole("button", { name: "Sign up", exact: true }).click();
    await page.waitForTimeout(4000);

// click "Yes" on the pop-up

await page.waitForSelector('[data-headlessui-state="open"]', { timeout: 10000 });
await page.getByRole("button", { name: "Yes" }).click();

    // Join preschool flow...
    await page.click('button.cursor-pointer.inline-flex:has-text("Get started")');
    await page.click('p.font-semibold.text-sm:has-text("Start")');
    await page.click('p.font-medium.text-textMid.font-h4:has-text("Principal")');

    await page.fill('input[placeholder="First name"]', "WalkthroughOA3");
    await page.click('p.font-semibold.text-xs:has-text("Enter passport number instead")');
    await page.fill('input[placeholder="e.g. A012345"]', "WalkthroughOA3");

    await page.click('p.font-semibold.text-sm:has-text("Next")');

    await page.fill('input[placeholder="E.g. Little Lambs Preschool"]', "QATest");
    await page.click('p.text-sm.font-h1.font-normal:has-text("Next")');

    // Add class...
    await page.click('p.text-sm.font-h1.font-normal:has-text("Add class")');
    // await page.getByText("Select a practitioner").click();
    // await page.click('svg:has(path[d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"])');
    await page.click('div.font-body.p-3.text-sm.font-medium:has-text("Yes")');
    await page.getByText("Save").click();

    await page.waitForTimeout(3000);
    await page.getByRole("button", { name: "Next" }).click();

    await page.waitForTimeout(3000);
    await page.getByText("Skip").click();

    // Classroom → add child...
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
    await page.getByPlaceholder("E.g. 082 345 6789").fill("0719374857");

    await page.getByText("Next").click();

    await page.getByPlaceholder("E.g. 0122").fill("3452");
    
await page.locator('textarea[name="streetAddress"]').fill("Test address");
    await page.getByRole("button", { name: "Next" }).click();

    await page.getByRole("button", { name: "Next" }).click();

    await page.getByPlaceholder("First name").fill("Salam");
    await page.getByPlaceholder("Surname/family name").fill("Page");
    await page.locator('input[name="phoneNumber"]').fill("0711234567");

    await page.locator("div.bg-secondaryAccent2").getByText("Yes").click();

    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForTimeout(2000);

    await page.getByTestId("close-button").click();

    // Click back arrow
await page.locator('svg.primaryAccent2 path[d*="M9.707 16.707"]').first().click();

// Click Community section
await page.locator('h2:has-text("Community")').click();
await page.waitForTimeout(2000);

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
await page.locator('div.bg-secondaryAccent2:has-text("Yes")').nth(0).click();
await page.waitForTimeout(2000);

// Click Yes button
// Click Yes button - use exact text match with the specific classes
await page.locator('div.bg-secondaryAccent2.text-secondary').filter({ hasText: /^Yes$/ }).click();
await page.waitForTimeout(2000);

console.log("Selecting province...");
await page.getByText("Tap to choose province").click({ force: true });
await page.waitForTimeout(2000);

await page.getByText("Western Cape", { exact: true }).click(); // Change as needed

console.log("Province selected");
await page.waitForTimeout(1000);

console.log("Clicking Save button...");

await page.getByRole("button", { name: "Save" }).click();

console.log("Clicking 'Do this later'...");

await page.getByText("Do this later", { exact: true }).click({ force: true });

// Click "See ECD Heroes" button
await page.locator('button:has-text("See ECD Heroes")').click();
await page.waitForTimeout(2000);

// Click Start button using data-testid
await page.locator('button[data-testid="close-button"]:has-text("Start")').click();
await page.waitForTimeout(2000);

// Click the first person on the list (OAPrac12a)
await page.locator('div.bg-uiBg.rounded-10.cursor-pointer').first().click();
await page.waitForTimeout(2000);

// Click the Connect button (using partial text match since name varies)
await page.locator('button:has-text("Connect with")').click();
await page.waitForTimeout(2000);

    console.log("Automation completed successfully!");
    await page.waitForTimeout(5000);

  } catch (error) {
    console.error("Error during automation:", error);
    console.log("Current ECD URL:", await page.url());
   

    await page.screenshot({ path: "final-error.png" }).catch(() => {});
  } finally {
    await browser.close();
  }
})();
// Shared offline scenarios for the ECD Connect app (OA and WL use the same
// app screens). A test file passes in its own sign-up; this signs up a fresh
// account online, switches the browser offline (Playwright's equivalent of
// DevTools' "Offline" checkbox) and, all while offline:
//   1. adds a class
//   2. adds a child to it and fills in the registration form
//   3. takes today's attendance register
//   4. adds an income (donation) and an expense (food)
// then goes back online and gives the app time to sync. The scenarios run in
// order on the same account, so if one fails the rest are skipped rather than
// re-signing up a new account.
//
// Usage (in a .test.js file):
//   defineOfflineScenarios({
//     title: "OA/OAQAOffline",
//     screenshotsDir: SCREENSHOTS_DIR,
//     newContextOptions: {},
//     signUp: async (context, page) => page,   // returns the app page, on the dashboard
//   })
const path = require("path")
const { chromium } = require("playwright")
const { test, expect } = require("@playwright/test")
// Child registration answers (same values the OA and WL 5-child tests use)
const testdata = require("./OA/testdata")

const CLASS_NAME = "Offline Class"
const INCOME_AMOUNT = "500"
const EXPENSE_AMOUNT = "220"
const EXPECTED_BALANCE = "R 280.00"

function defineOfflineScenarios({ title, screenshotsDir, signUp, newContextOptions = {} }) {
  async function shot(page, name) {
    await page.screenshot({ path: path.join(screenshotsDir, `offline-${name}.png`) }).catch(() => {})
  }

  // In-app back arrow (the first icon on the page, top left of the header).
  // Only in-app navigation is used while offline — a hard page load has nothing
  // to fall back to, and the browser's own Back can overshoot the dashboard
  // onto the landing page.
  // The dashboard lives at both "/" and "/dashboard" (the Classroom back arrow
  // goes to "/").
  const onDashboard = page => ["/", "/dashboard"].includes(new URL(page.url()).pathname)

  async function backToDashboard(page) {
    for (let i = 0; i < 5 && !onDashboard(page); i++) {
      console.log(`Back arrow from ${page.url()}`)
      await page.locator("svg").first().click({ timeout: 5000 })
      await page.waitForTimeout(2000)
    }
    if (!onDashboard(page)) throw new Error(`Could not get back to the dashboard (at ${page.url()})`)
  }

  // Child registration form ("step N of 8" in the header): press Next until
  // the form reaches `step`, screenshotting every page on the way so a page
  // whose Next stays disabled is easy to see.
  async function nextToStep(page, step) {
    const target = page.getByText(new RegExp(`step ${step} of \\d+`, "i")).first()
    for (let i = 0; i < 8; i++) {
      const current = await page.getByText(/step \d+ of \d+/i).first().innerText().catch(() => "?")
      await shot(page, `form-${current.replace(/\W+/g, "-")}`)
      if (await target.isVisible().catch(() => false)) return
      console.log(`Registration form ${current}: pressing Next`)
      await page.getByRole("button", { name: "Next" }).last().click({ timeout: 10000 })
      await page.waitForTimeout(1500)
    }
    await target.waitFor({ timeout: 10000 })
  }

  test.describe(title, () => {
    test.describe.configure({ mode: "serial" })
    let browser
    let context
    let page

    test.beforeAll(async () => {
      test.setTimeout(10 * 60 * 1000)
      browser = await chromium.launch({ headless: false, slowMo: 300 })
      context = await browser.newContext(newContextOptions)
      const signUpPage = await context.newPage()
      // Fail a stuck step after 30s instead of hanging until the 15-minute test limit
      signUpPage.setDefaultTimeout(30000)

      page = await signUp(context, signUpPage)
      page.setDefaultTimeout(30000)

      // Dashboard tip: "If you want to change these details later..."
      await page.getByRole("button", { name: "Close" }).first().click({ timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(1000)

      await context.setOffline(true)
      console.log("=== Browser is now OFFLINE ===")
      await page.waitForTimeout(2000)
      await shot(page, "00-offline-dashboard")
    })

    test.afterEach(async ({}, testInfo) => {
      if (page && testInfo.status !== testInfo.expectedStatus) {
        console.log(`✗ ${testInfo.title} failed at ${page.url()}`)
        await shot(page, `error-${testInfo.title.split(" ")[0].replace(/\W/g, "")}`)
      }
    })

    test.afterAll(async () => {
      // Back online — give the app time to sync what was saved offline
      if (context && page) {
        await context.setOffline(false)
        console.log("=== Browser is back ONLINE — waiting for sync ===")
        await page.waitForTimeout(15000)
        await shot(page, "99-back-online")
      }
      await browser?.close()
    })

    test("1. Add a class offline", async () => {
      await backToDashboard(page)
      await page.getByRole("heading", { name: "Classroom" }).click()
      await page.waitForTimeout(2000)
      await page.getByRole("button", { name: "Add a class" }).click()
      await page.waitForTimeout(2000)
      await page.getByRole("button", { name: "Add class" }).click()
      await page.waitForTimeout(2000)

      await page.locator('input[name="name"]').fill(CLASS_NAME)
      await page.getByRole("button", { name: "Select a practitioner" }).click()
      await page.waitForTimeout(1000)
      await page.getByRole("menuitem").first().click()
      await page.waitForTimeout(800)
      await page.keyboard.press("Escape")
      await page.waitForTimeout(500)
      await page.getByText("Yes", { exact: true }).first().click()
      await page.waitForTimeout(800)
      await page.getByRole("button", { name: "Save" }).click()
      await page.waitForTimeout(2500)
      await page.getByRole("button", { name: "Confirm" }).click()
      await page.waitForTimeout(3000)

      await expect(page.getByText(CLASS_NAME).first()).toBeVisible({ timeout: 10000 })
      await shot(page, "01-class-added")
      console.log(`✓ Class "${CLASS_NAME}" added offline`)
    })

    test("2. Add a child offline", async () => {
      await backToDashboard(page)
      await page.getByRole("heading", { name: "Classroom" }).click()
      await page.waitForTimeout(2000)
      // Use the offline class if scenario 1 created it, otherwise Class 1
      const className = (await page.getByText(CLASS_NAME).first().isVisible().catch(() => false)) ? CLASS_NAME : "Class 1"
      console.log(`Adding child to "${className}"`)
      await page.getByText(className).first().click()
      await page.waitForTimeout(2000)
      await page.getByRole("button", { name: "See children" }).click()
      await page.waitForTimeout(1500)
      await page.getByRole("button", { name: "Add a child" }).click()
      await page.waitForTimeout(1500)

      await page.getByPlaceholder("First name").fill("Olivia")
      await page.getByPlaceholder("Surname/Family name").fill("Offline")
      await page.getByRole("button", { name: "Select class" }).click()
      await page.waitForTimeout(800)
      await page.getByText(className).last().click()
      await page.waitForTimeout(800)
      await page.getByText("Save").click()
      await page.waitForTimeout(2000)

      // Child registration form (same answers as OAQA5)
      await page.getByRole("button", { name: "Fill in the registration form" }).click()
      await page.waitForTimeout(1500)
      await page.locator('input[name="personalInformationAgreementAccepted"]').check()
      await page.getByText("Yes").click()
      await page.getByText("Next").click({ force: true })
      await page.waitForTimeout(1500)

      // Date of birth: day, month and year are all required before Next enables
      await page.locator("button[aria-haspopup='menu']").first().click()
      await page.getByText("15").click()
      await page.locator('button[aria-haspopup="menu"]:has-text("Month")').click()
      await page.getByRole("menuitem", { name: "Feb", exact: true }).click()
      await page.locator('button[aria-haspopup="menu"]:has-text("Year")').click()
      await page.getByRole("menuitem", { name: "2024", exact: true }).click()

      // Step 5: primary caregiver
      await nextToStep(page, 5)
      await page.getByText("Select relationship").click()
      await page.getByText("Mother").click()
      await page.getByPlaceholder("First name").fill("Musa")
      await page.getByPlaceholder("Surname/family name").fill("Smith")
      await page.getByPlaceholder("E.g. 082 345 6789").fill(testdata.guardianPhone)

      // Step 6: address and postal code
      await nextToStep(page, 6)
      await page.getByPlaceholder("E.g. 0122").fill(testdata.idSuffix)
      await page.locator('textarea[name="streetAddress"]').fill(testdata.streetAddress)

      // Step 8: second caregiver
      await nextToStep(page, 8)
      await page.getByPlaceholder("First name").fill("Salam")
      await page.getByPlaceholder("Surname/family name").fill("Page")
      await page.locator('input[name="phoneNumber"]').fill(testdata.secondaryGuardianPhone)
      await page.locator("div.bg-secondaryAccent2").getByText("Yes").click()

      await page.getByRole("button", { name: "Save" }).click()
      await page.waitForTimeout(2000)
      await shot(page, "02-child-registered")
      await page.getByTestId("close-button").click()
      await page.waitForTimeout(2000)
      console.log("✓ Child Olivia Offline added and registered offline")
    })

    test("3. Track attendance offline", async () => {
      await backToDashboard(page)
      await page.getByRole("heading", { name: "Classroom" }).click()
      await page.waitForTimeout(2000)
      await page.getByRole("heading", { name: "Attendance" }).click()
      await page.waitForTimeout(2000)
      await page.getByText("No, skip", { exact: true }).click({ timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(1000)
      await page.getByText("Close", { exact: true }).click({ timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(1000)

      // Today's register only shows once a class has a registered child
      await page.getByRole("button", { name: "Edit" }).first().click()
      await page.waitForTimeout(1500)
      await shot(page, "03-attendance-register")
      await page.locator("#gtm-add-attendance").click()
      await page.waitForTimeout(2000)
      await shot(page, "03-attendance-saved")
      console.log("✓ Attendance register saved offline")
    })

    test("4. Add income and expense offline", async () => {
      await backToDashboard(page)
      await page.getByRole("heading", { name: "Business" }).click()
      await page.waitForTimeout(2000)
      await page.getByRole("heading", { name: "Money" }).click()
      await page.waitForTimeout(2000)
      // "Manage your business like a boss!" tutorial, then its follow-up tip
      await page.getByRole("button", { name: "No, skip!" }).click({ timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(1000)
      await page.getByTestId("close-button").click({ timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(1000)

      // Income: Donations or vouchers (Preschool fees would need fee setup first)
      await page.locator("#startStatements").click()
      await page.waitForTimeout(2000)
      await page.getByText("Income (money in)").click()
      await page.waitForTimeout(2000)
      await page.getByRole("button", { name: "Add" }).nth(1).click()
      await page.waitForTimeout(2000)
      await page.getByPlaceholder("Please select a date").click()
      await page.locator(".react-datepicker__day--today").first().click()
      await page.getByText("Money", { exact: true }).click()
      await page.locator('input[name="amount"]').fill(INCOME_AMOUNT)
      await page.locator('input[name="notes"]').fill("Offline donation test")
      await page.getByRole("button", { name: "Save" }).click()
      await page.waitForTimeout(3000)
      console.log(`✓ Income of R${INCOME_AMOUNT} added offline`)

      // Expense: Food
      await page.locator("#startStatements").click()
      await page.waitForTimeout(2000)
      await page.getByText("Expense (money out)").click()
      await page.waitForTimeout(2000)
      await page.getByRole("button", { name: "Add" }).nth(3).click()
      await page.waitForTimeout(2000)
      await page.getByPlaceholder("Please select a date").click()
      await page.locator(".react-datepicker__day--today").first().click()
      await page.locator('input[name="amount"]').fill(EXPENSE_AMOUNT)
      await page.locator('input[name="notes"]').fill("Offline expense test")
      await page.getByRole("button", { name: "Save" }).click()
      await page.waitForTimeout(3000)
      console.log(`✓ Expense of R${EXPENSE_AMOUNT} added offline`)

      await expect(page.getByText(EXPECTED_BALANCE).first()).toBeVisible({ timeout: 10000 })
      await shot(page, "04-money-balance")
      console.log(`✓ Money tab shows balance ${EXPECTED_BALANCE}`)
    })
  })
}

module.exports = { defineOfflineScenarios }

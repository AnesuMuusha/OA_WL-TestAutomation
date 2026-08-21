const { chromium } = require("playwright")
const { test } = require("@playwright/test")
const testdata = require("./testdata")

// Optimized Sign up automation
test("OA/stagingSignUp", async () => {
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    // Step 1: Navigate to landing page (reduced timeout)
    console.log("Navigating to landing page...")
    await page.goto("https://app.staging.ecdconnect.co.za/", {
      timeout: 40000,
      waitUntil: "domcontentloaded",
    })
    console.log("Landing page loaded successfully")

    // Step 2: Click Sign up button (reduced wait time)
    console.log("Looking for Sign up button...")
    await page.getByRole("button", { name: "Sign up" }).waitFor({
      state: "visible",
      timeout: 5000,
    })

    console.log("Clicking Sign up button...")
    await page.getByRole("button", { name: "Sign up" }).click()

    // Wait for signup page (reduced timeout)
    console.log("Waiting for signup page to load...")
    await page.waitForLoadState("networkidle", { timeout: 15000 })
    console.log("Signup page loaded")

    console.log("Entering phone number...");
    await page.getByPlaceholder("e.g 0123456789").fill(testdata.practitionerPhone);

    // Optimized checkbox clicking
    console.log("Clicking checkboxes...")
    try {
      // First checkbox - terms and conditions
      await page.locator("input[type='checkbox']").first().click({ timeout: 3000 })
      console.log("First checkbox clicked")
    } catch (error) {
      await page.locator("text=I accept").first().click({ timeout: 3000 })
      console.log("First checkbox clicked via text")
    }

    try {
      // Second checkbox - data permissions
      await page.locator("input[type='checkbox']").nth(1).click({ timeout: 3000 })
      console.log("Second checkbox clicked")
    } catch (error) {
      await page.locator("text=data permissions").click({ timeout: 3000 })
      console.log("Second checkbox clicked via text")
    }

    // Optimized Yes button click
    console.log("Clicking Yes button...")
    try {
      await page.getByText("Yes", { exact: true }).click({ force: true, timeout: 3000 })
      console.log("Yes button clicked")
    } catch (error) {
      await page.locator("div.cursor-pointer.bg-secondaryAccent2").click({ force: true, timeout: 3000 })
      console.log("Yes button clicked via CSS selector")
    }

    // Optimized Next button click
    console.log("Clicking Next button...")
    try {
      await page.getByRole("button", { name: "Next" }).click({ force: true, timeout: 3000 })
      console.log("Next button clicked")
    } catch (error) {
      await page.getByText("Next").click({ force: true, timeout: 3000 })
      console.log("Next button clicked via text")
    }

    // Fill form fields quickly
    console.log("Filling form fields...")
    await page.click('button:has-text("Create a username")')
    await page.fill('input[name="password"]', 'Tester_12') 
    await page.fill('input[placeholder="e.g. Nothando_123"]', 'Jabulani')
   
    // Click Sign up and wait for response
    console.log("Clicking Sign up button...")
    await page.click('button:has-text("Sign up")')
//Account created

  }  finally {
    await browser.close()
  }
})
const { chromium } = require("playwright")
;(async () => {
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    // Step 1: Navigate to landing page
    console.log("Navigating to landing page...")
    await page.goto("https://growgreat-qa-portal.azurewebsites.net/", {
      timeout: 40000,
      waitUntil: "networkidle", // Wait for network to be idle to ensure dynamic content loads
    })
    console.log("Landing page loaded successfully")

    // Step 2: Take a screenshot for debugging
    await page.screenshot({ path: "landing_page.png", fullPage: true })
    console.log("Screenshot saved as landing_page.png")

    // Step 3: Locate and enter email (the form uses email, not username)
    console.log("Locating email input field...")
    let emailSelector = 'input[name="email"]' // Default selector
    const possibleSelectors = [
      'input[name="email"]', // Primary selector - matches the actual form
      'input[id="email"]',
      'input[name="username"]', // Fallback in case form changes
      'input[id="username"]',
      'input[type="text"]', // Generic fallback
    ]

    let emailFieldFound = false
    for (const selector of possibleSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 15000 })
        emailSelector = selector
        emailFieldFound = true
        console.log(`Email field found with selector: ${selector}`)
        break
      } catch (e) {
        console.log(`Selector ${selector} not found, trying next...`)
      }
    }

    if (!emailFieldFound) {
      throw new Error("Email input field not found with any selector")
    }

    await page.click(emailSelector)
    await page.fill(emailSelector, "admin")
    console.log("Entered email: admin")

    // Step 4: Locate and enter password
    console.log("Locating password input field...")
    await page.waitForSelector('input[name="password"]', { timeout: 15000 })
    await page.click('input[name="password"]')
    await page.fill('input[name="password"]', "ECDConnect123!")
    console.log("Entered password: ECDConnect123!")

    // Step 5: Locate and click the login button
    console.log("Locating login button...")
    await page.waitForSelector("p.text-sm.font-h1.font-normal.text-white", { timeout: 15000 })
    await page.click("p.text-sm.font-h1.font-normal.text-white")
    console.log("Clicked login button")

    await page.click('a[href="/users"]')
    console.log("Clicked Users button")

    await page.click('a[href="/users/health-care-worker"]');
    console.log("Clicked CHW button")

    await page.click('text=Add CHWs');
    console.log("Clicked ADD CHW button")

await page.click('button:has-text("Add one CHW")');
    console.log("Clicked Add one CHW button")
    await page.waitForTimeout(5000)

    // Click and type in the firstName field
await page.click('input[name="firstName"]');
await page.type('input[name="firstName"]', 'AutoFirstName');


    // Step 6: Take a screenshot after login attempt
    await page.screenshot({ path: "post_login.png", fullPage: true })
    console.log("Screenshot saved as post_login.png")
  } catch (error) {
    console.error("An error occurred:", error)
    // Take a screenshot on error for debugging
    await page.screenshot({ path: "error_screenshot.png", fullPage: true })
    console.log("Error screenshot saved as error_screenshot.png")
  } finally {
    await browser.close()
    console.log("Browser closed")
  }
})()

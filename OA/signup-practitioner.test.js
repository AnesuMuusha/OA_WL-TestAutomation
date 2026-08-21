const { chromium } = require("playwright")
const { test } = require("@playwright/test")
const testdata = require("./testdata")
const fs = require("fs")
const path = require("path")
const SCREENSHOTS_DIR = path.join(__dirname, "screenshots")
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })

// Optimized Sign up automation
test("OA/signup-practitioner", async () => {
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    // Step 1: Navigate to landing page (reduced timeout)
    console.log("Navigating to landing page...")
    await page.goto("https://ecdconnect-qa-app.azurewebsites.net/", {
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
    await page.fill('input[placeholder="e.g. Nothando_123"]', 'OATestContent1')
    await page.fill('input[placeholder="e.g 0123456789"]', testdata.ownPhone)

//ProgressSummaryOA0013
//WLUmstha1
    // Optimized network monitoring
    let verificationCode = null
    const verificationCodePromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout')), 30000) // Reduced timeout

      page.on('response', async (response) => {
        const url = response.url()
        if (url.includes('add-oa-practitioner')) {
          console.log(`API Response: ${url} - Status: ${response.status()}`)
          
          try {
            let responseBody
            try {
              responseBody = await response.json()
            } catch (error) {
              responseBody = await response.text()
            }

            console.log(`Response: ${JSON.stringify(responseBody)}`)

            // Fixed verification code extraction
            let code
            if (typeof responseBody === 'object') {
              code = responseBody.verificationCode || responseBody.code
            } else {
              // Convert to string first, then check if it's a 6-digit code
              const responseString = String(responseBody).trim()
              if (/^\d{6}$/.test(responseString)) {
                code = responseString
              }
            }

            if (code && /^\d{6}$/.test(String(code))) {
              console.log(`Verification Code Found: ${code}`)
              clearTimeout(timeout)
              resolve(String(code))
            }
          } catch (error) {
            console.log(`Error processing response: ${error.message}`)
          }
        }
      })
    })

    // Click Sign up and wait for response
    console.log("Clicking Sign up button...")
    await page.click('button:has-text("Sign up")')

    // Wait for verification code (reduced timeout)
    try {
      verificationCode = await verificationCodePromise
      console.log(`Using verification code: ${verificationCode}`)
      
      // Fill verification code quickly
      await page.waitForSelector('input[placeholder="------"]', { 
        state: 'visible', 
        timeout: 8000 
      })
      await page.fill('input[placeholder="------"]', verificationCode)
      console.log("Verification code entered")
      
      // Optional: Click verify button if needed
      try {
        await page.click('button:has-text("Verify")', { timeout: 3000 })
        console.log("Verify button clicked")
      } catch (error) {
        console.log("No verify button found or needed")
      }

    } catch (error) {
      console.error('Verification code timeout or error:', error.message)
      
      // Fallback: Try to continue without verification code
      console.log("Attempting to continue without verification code...")
      await page.waitForTimeout(2000)
    }
//confirm code
await page.locator('p.text-sm.font-h1.font-normal.text-white', { hasText: 'Confirm' }).click(); 
    console.log("Signup process completed!")
    await page.waitForTimeout(2000) // Reduced final wait

  } catch (error) {
    console.error("Signup failed:", error)
    console.log("Current URL:", page.url())
    
    // Quick error screenshot
    try {
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "error-screenshot.png") })
      console.log("Error screenshot saved")
    } catch (screenshotError) {
      console.log("Could not save screenshot")
    }
  } finally {
    await browser.close()
  }
})
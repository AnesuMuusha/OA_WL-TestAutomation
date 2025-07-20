const { chromium } = require("playwright")

// Optimized Sign up automation
;(async () => {
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    // Step 1: Navigate to landing page (reduced timeout)
    console.log("Navigating to landing page...")
    await page.goto("https://growgreat-qa-portal.azurewebsites.net/", {
      timeout: 40000,
      waitUntil: "domcontentloaded",
    })
    console.log("Landing page loaded successfully")

   
  } finally {
    await browser.close()
  }
})()
const { chromium } = require("playwright")
const { test } = require("@playwright/test")

test("GoogleSearch", async () => {
  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage()

  try {
    // Navigate to Google
    await page.goto("https://www.google.com", { timeout: 30000, waitUntil: "domcontentloaded" })

    // Wait for any consent or privacy dialogs
    await page.waitForTimeout(2000)

    // Try to close any overlays/popups
    try {
      await page.locator('button', { hasText: /Accept all|I agree|Reject all/i }).first().click({ timeout: 3000 })
      await page.waitForTimeout(1000) // Give time for overlay to disappear
    } catch (e) {
      // No overlay found
    }

    // Wait for search box (input or textarea)
    await page.waitForSelector('input[name="q"], input[title="Search"], textarea[name="q"]', { timeout: 15000 })

    // Use a robust selector for the search box
    const searchBox =
      await page.$('input[name="q"]') ||
      await page.$('input[title="Search"]') ||
      await page.$('textarea[name="q"]')

    if (searchBox) {
      await searchBox.fill("King Fit")
      await page.keyboard.press("Enter")
      await page.waitForSelector("#search", { timeout: 10000 })
      console.log('Search for "King Fit" completed.')
    } else {
      throw new Error("Search box not found")
    }

    await page.waitForTimeout(2000)
  } catch (error) {
    console.error("Google search failed:", error)
  } finally {
    await browser.close()
  }
})
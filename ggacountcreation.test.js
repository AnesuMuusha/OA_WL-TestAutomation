const { chromium } = require("playwright")

// --- Test data (change these freely; the script tracks them automatically) ---
const CHW = {
  firstName: "AutoFirstName2",
  surname: "ID003",
  phoneNumber: "0834071970",
  passportNumber: "ID003",
  clinicLabel: "Clinic_0201",
  clinicValue: "3052ae47-8a61-4d0d-a4d5-c1dcd5b00d9e",
}

// The name column renders as "<firstName> <surname>"
const fullName = `${CHW.firstName} ${CHW.surname}`
;(async () => {
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    // Step 1: Navigate to landing page
    console.log("Navigating to landing page...")
    await page.goto("https://growgreat-qa-portal.azurewebsites.net/", {
      timeout: 40000,
      waitUntil: "networkidle",
    })
    console.log("Landing page loaded successfully")

    // Step 2: Login
    console.log("Locating email input field...")
    let emailSelector = 'input[name="email"]'
    const possibleSelectors = [
      'input[name="email"]',
      'input[id="email"]',
      'input[name="username"]',
      'input[id="username"]',
      'input[type="text"]',
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

    await page.waitForSelector('input[name="password"]', { timeout: 15000 })
    await page.click('input[name="password"]')
    await page.fill('input[name="password"]', "ECDConnect123!")
    console.log("Entered password")

    await page.waitForSelector("p.text-sm.font-h1.font-normal.text-white", { timeout: 15000 })
    await page.click("p.text-sm.font-h1.font-normal.text-white")
    console.log("Clicked login button")

    // Step 3: Navigate to CHW section
    await page.click('a[href="/users"]')
    console.log("Clicked Users button")

    await page.click('a[href="/users/health-care-worker"]')
    console.log("Clicked CHW button")

    // Step 4: Add one CHW
    await page.click("text=Add CHWs")
    console.log("Clicked ADD CHW button")

    await page.click('button:has-text("Add one CHW")')
    console.log("Clicked Add one CHW button")
    await page.waitForTimeout(5000)

    await page.click('input[name="firstName"]')
    await page.type('input[name="firstName"]', CHW.firstName)
    console.log(`Entered firstName: ${CHW.firstName}`)

    await page.click('input[name="surname"]')
    await page.type('input[name="surname"]', CHW.surname)
    console.log(`Entered surname: ${CHW.surname}`)
    await page.waitForTimeout(1000)

    await page.fill('input[name="phoneNumber"]', CHW.phoneNumber)
    console.log(`Filled phone number: ${CHW.phoneNumber}`)
    await page.waitForTimeout(1000)

    // Step 5: Select clinic
    const clinicSelect = 'select[name="clinicId"]'
    console.log("Waiting for clinic dropdown...")
    await page.waitForSelector(clinicSelect, { timeout: 15000 })

    await page.waitForFunction(
      (label) => {
        const sel = document.querySelector('select[name="clinicId"]')
        return sel && Array.from(sel.options).some((o) => o.textContent.trim() === label)
      },
      CHW.clinicLabel,
      { timeout: 15000 },
    )
    console.log("Clinic options loaded")

    try {
      await page.selectOption(clinicSelect, CHW.clinicValue)
    } catch (e) {
      console.log("Value select failed, falling back to label...")
      await page.selectOption(clinicSelect, { label: CHW.clinicLabel })
    }

    const selectedText = await page.$eval(clinicSelect, (el) => el.options[el.selectedIndex].textContent.trim())
    if (selectedText !== CHW.clinicLabel) {
      throw new Error(`Clinic not selected correctly, got: ${selectedText}`)
    }
    console.log("Verified clinic selection:", selectedText)

    // Step 6: Passport
    const passportButton = 'button:has(p:text-is("Passport"))'
    await page.waitForSelector(passportButton, { state: "visible", timeout: 15000 })
    await page.click(passportButton)
    console.log("Clicked Passport button")
    await page.waitForTimeout(1000)

    const idNumberInput = 'input[name="idNumber"]'
    await page.waitForSelector(idNumberInput, { state: "visible", timeout: 15000 })
    await page.click(idNumberInput)
    await page.fill(idNumberInput, CHW.passportNumber)
    console.log(`Entered passport number: ${CHW.passportNumber}`)
    await page.waitForTimeout(1000)

    // Step 7: Save
    await page.waitForTimeout(1000)
    const saveButton = 'button:has(p:text-is("Save"))'
    await page.waitForSelector(saveButton, { state: "visible", timeout: 15000 })
    await page.click(saveButton)
    console.log("Clicked Save button")

    // Step 8: Wait for the table and click the CHW we just added, by name (not by row position).
    // The name lives inside a <button> in the row: e.g. "AutoFirstName2 ID003".
    console.log(`Looking for the newly added CHW row: "${fullName}"`)

    const addedUserButton = page.locator(`table button:text-is("${fullName}")`).first()
    await addedUserButton.waitFor({ state: "visible", timeout: 20000 })

    await addedUserButton.scrollIntoViewIfNeeded()
    await addedUserButton.click()
    console.log(`Clicked newly added CHW: ${fullName}`)

    await page.waitForTimeout(3000)

    // Step 9: Screenshot
    await page.screenshot({ path: "post_click_user.png", fullPage: true })
    console.log("Screenshot saved as post_click_user.png")
  } catch (error) {
    console.error("An error occurred:", error)
    await page.screenshot({ path: "error_screenshot.png", fullPage: true })
    console.log("Error screenshot saved as error_screenshot.png")
  } finally {
    await browser.close()
    console.log("Browser closed")
  }
})()
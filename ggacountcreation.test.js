const { chromium } = require("playwright")
const fs = require("fs")
const path = require("path")

// --- Test data (change these freely; the script tracks them automatically) ---
// The numeric ID auto-increments on every run (persisted in .chw-counter.json)
// so re-running never collides with a previously created user.
const COUNTER_FILE = path.join(__dirname, ".chw-counter.json")
const START_ID = 25 // next unused ID after ID0024

function nextId() {
  let current = START_ID
  if (fs.existsSync(COUNTER_FILE)) {
    current = JSON.parse(fs.readFileSync(COUNTER_FILE, "utf8")).lastId + 1
  }
  fs.writeFileSync(COUNTER_FILE, JSON.stringify({ lastId: current }))
  return `ID${String(current).padStart(4, "0")}`
}

const generatedId = nextId()

const CHW = {
  firstName: generatedId,
  surname: generatedId,
  phoneNumber: "0834071970",
  passportNumber: generatedId,
  clinicLabel: "Clinic_0201",
  clinicValue: "3052ae47-8a61-4d0d-a4d5-c1dcd5b00d9e",
}

// The name column renders as "<firstName> <surname>"
const fullName = `${CHW.firstName} ${CHW.surname}`

// Walks a multi-step "Open a new folder" registration wizard (Child, Pregnant mom, ...)
// filling in whatever fields it finds using name/placeholder heuristics, answering the
// app's own Yes/No prompts with its suggested defaults, and clicking Next/Save as they
// become enabled. `extraStepHandler`, if given, runs each iteration for flow-specific
// fields (e.g. child date of birth) before the generic fallback fill.
async function runRegistrationWizard(invitePage, { label, generatedId, CHW, namePrefix, surnamePrefix, extraStepHandler, maxSteps = 20 }) {
  const personFirstName = `${namePrefix}${generatedId}`
  const personSurname = `${surnamePrefix}${generatedId}`

  let lastBodyText = null
  let stuckCount = 0

  for (let step = 1; step <= maxSteps; step++) {
    await invitePage.waitForTimeout(1500)
    const bodyText = await invitePage.locator("body").innerText().catch(() => "")
    console.log(`--- ${label} form step ${step} ---`)

    stuckCount = bodyText === lastBodyText ? stuckCount + 1 : 0
    lastBodyText = bodyText

    // Inventory of current form controls, used by the generic fill heuristics below
    const controls = await invitePage.evaluate(() => {
      const describe = (el) => ({
        tag: el.tagName,
        type: el.getAttribute("type"),
        name: el.getAttribute("name"),
        placeholder: el.getAttribute("placeholder"),
        value: el.value !== undefined ? el.value : null,
      })
      return { inputs: Array.from(document.querySelectorAll("input")).map(describe) }
    })

    // Consent checkbox
    const consentCheckbox = invitePage.locator('input[type="checkbox"]').first()
    if ((await consentCheckbox.count()) > 0 && !(await consentCheckbox.isChecked().catch(() => true))) {
      await consentCheckbox.check({ force: true }).catch(() => {})
    }

    // Name / surname
    const firstNameInput = invitePage.getByPlaceholder(/first name/i).first()
    if ((await firstNameInput.count()) > 0 && (await firstNameInput.isVisible().catch(() => false))) {
      const val = await firstNameInput.inputValue().catch(() => "")
      if (!val) await firstNameInput.fill(personFirstName).catch(() => {})
    }
    const surnameInput = invitePage.getByPlaceholder(/surname|family name/i).first()
    if ((await surnameInput.count()) > 0 && (await surnameInput.isVisible().catch(() => false))) {
      const val = await surnameInput.inputValue().catch(() => "")
      if (!val) await surnameInput.fill(personSurname).catch(() => {})
    }

    // Flow-specific fields (e.g. child DOB/gender/weight/length)
    if (extraStepHandler) {
      await extraStepHandler({ invitePage, bodyText })
    }

    // Road to Health Book / Maternal Case Record -> No (the "Yes" branch requires a
    // real photo upload the app won't accept from a synthetic file, which permanently
    // blocks Next/Save)
    if (bodyText.includes("Road to Health Book") || bodyText.includes("Maternal Case Record")) {
      await invitePage.getByText("No", { exact: true }).click({ force: true }).catch(() => {})
      console.log("Clicked No for Road to Health Book / Maternal Case Record question (avoids mandatory photo upload)")
    }

    // "Is the caregiver already on CHW Connect?" -> No (per the app's own hint)
    if (bodyText.match(/already on CHW Connect/i)) {
      await invitePage.getByText("No", { exact: true }).click({ force: true }).catch(() => {})
      console.log("Clicked No for 'already on CHW Connect' question")
    }

    // "Does <name> use this cellphone number for WhatsApp?" -> Yes
    if (bodyText.match(/use this cellphone number for whatsapp/i)) {
      await invitePage.getByText("Yes", { exact: true }).click({ force: true }).catch(() => {})
      console.log("Clicked Yes for WhatsApp question")
    }

    // Caregiver relationship
    if (bodyText.includes("Select relationship")) {
      await invitePage.getByText("Select relationship").click().catch(() => {})
      await invitePage.waitForTimeout(500)
      await invitePage.getByText("Mother", { exact: true }).click().catch(() => {})
    }

    // Generic phone field
    const phoneInput = invitePage.locator('input[name="phoneNumber"]').first()
    if ((await phoneInput.count()) > 0 && (await phoneInput.isVisible().catch(() => false))) {
      const val = await phoneInput.inputValue().catch(() => "")
      if (!val) await phoneInput.fill(CHW.phoneNumber).catch(() => {})
    }

    // Generic fallback: fill any remaining empty text/number inputs based on name/placeholder
    const handledNames = new Set(["firstName", "weightAtBirth", "lengthAtBirth", "phoneNumber"])
    for (const inp of controls.inputs) {
      if (inp.type === "file" || inp.type === "checkbox" || inp.type === "radio") continue
      if (inp.value) continue
      const key = (inp.name || inp.placeholder || "").toLowerCase()
      if (!key || (inp.name && handledNames.has(inp.name))) continue

      let fillValue = null
      if (key.includes("surname") || key.includes("family")) fillValue = personSurname
      else if (key.includes("first") || key.includes("name")) fillValue = personFirstName
      else if (key.includes("age")) fillValue = "28"
      else if (key.includes("phone") || key.includes("cell")) fillValue = CHW.phoneNumber
      else if (key.includes("postal") || key.includes("code")) fillValue = "1234"
      else if (key.includes("address")) fillValue = "Test address"
      else if (inp.type === "number") fillValue = "1"
      else fillValue = "Test"

      const locator = inp.name
        ? invitePage.locator(`input[name="${inp.name}"], textarea[name="${inp.name}"]`).first()
        : invitePage.getByPlaceholder(inp.placeholder, { exact: true }).first()

      if ((await locator.count()) > 0 && (await locator.isVisible().catch(() => false))) {
        await locator.fill(fillValue).catch(() => {})
        console.log(`Generic fill: ${key} -> ${fillValue}`)
      }
    }

    // Address entry (final step): "Type in the address" reveals a plain textarea
    if (bodyText.includes("Type in the address")) {
      const typeAddressBtn = invitePage.getByText("Type in the address", { exact: true })
      if ((await typeAddressBtn.count()) > 0) {
        await typeAddressBtn.click({ force: true }).catch(() => {})
        await invitePage.waitForTimeout(1000)
      }
      const addressTextarea = invitePage.locator('textarea[placeholder="Add address"], textarea').first()
      if ((await addressTextarea.count()) > 0 && (await addressTextarea.isVisible().catch(() => false))) {
        const val = await addressTextarea.inputValue().catch(() => "")
        if (!val) {
          await addressTextarea.click().catch(() => {})
          await addressTextarea.fill("123 Test Street, Cape Town").catch(() => {})
          console.log("Filled address textarea")
        }
      }
      await invitePage.waitForTimeout(500)
    }

    // Save button ends the flow (only click when actually enabled)
    const saveBtn = invitePage.getByRole("button", { name: "Save", exact: true })
    if ((await saveBtn.count()) > 0 && (await saveBtn.isVisible().catch(() => false))) {
      const isDisabled = await saveBtn.isDisabled().catch(() => true)
      if (!isDisabled) {
        await saveBtn.click()
        console.log(`Clicked Save on ${label} form`)
        await invitePage.waitForTimeout(3000)

        const closeBtn = invitePage.getByRole("button", { name: "Close" })
        if ((await closeBtn.count()) > 0 && (await closeBtn.isVisible().catch(() => false))) {
          await closeBtn.click().catch(() => {})
          console.log("Closed confirmation modal")
        }

        return { success: true, firstName: personFirstName, surname: personSurname }
      } else {
        console.log(`Save button present but disabled on step ${step}.`)
      }
    }

    // Otherwise, advance
    const nextBtn = invitePage.getByRole("button", { name: "Next", exact: true })
    if ((await nextBtn.count()) > 0 && (await nextBtn.isVisible().catch(() => false))) {
      const nextDisabled = await nextBtn.isDisabled().catch(() => true)
      if (!nextDisabled) {
        await nextBtn.click({ force: true })
        console.log(`Clicked Next (step ${step})`)
      } else {
        console.log(`Next button present but disabled on step ${step}.`)
        if (stuckCount >= 4) {
          console.log(`No progress for ${stuckCount} iterations on step ${step} — stopping walk for inspection.`)
          break
        }
      }
    } else if (stuckCount >= 3) {
      console.log(`No progress for ${stuckCount} iterations on step ${step} — stopping walk for inspection.`)
      break
    }
  }

  // Stalled — dump diagnostics so the next handler can be written with real info
  const finalBodyText = await invitePage.locator("body").innerText().catch(() => "")
  console.log(`\n[STALLED] ${label} — full page text:\n${finalBodyText}`)
  const finalControls = await invitePage.evaluate(() => {
    const describe = (el) => ({
      tag: el.tagName,
      type: el.getAttribute("type"),
      name: el.getAttribute("name"),
      placeholder: el.getAttribute("placeholder"),
      value: el.value !== undefined ? el.value : null,
      disabled: el.disabled === true,
    })
    return {
      inputs: Array.from(document.querySelectorAll("input")).map(describe),
      selects: Array.from(document.querySelectorAll("select")).map(describe),
      textareas: Array.from(document.querySelectorAll("textarea")).map(describe),
    }
  })
  console.log(`[STALLED] ${label} — controls:`, JSON.stringify(finalControls, null, 2))
  await invitePage.screenshot({ path: `stalled_${label.replace(/\s+/g, "_").toLowerCase()}.png`, fullPage: true }).catch(() => {})

  return { success: false, firstName: personFirstName, surname: personSurname }
}

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
    // The name lives inside a <button> in the row: e.g. "AutoFirstName2 ID0024".
    console.log(`Looking for the newly added CHW row: "${fullName}"`)

    const addedUserButton = page.locator(`table button:text-is("${fullName}")`).first()
    await addedUserButton.waitFor({ state: "visible", timeout: 20000 })

    await addedUserButton.scrollIntoViewIfNeeded()
    await addedUserButton.click()
    console.log(`Clicked newly added CHW: ${fullName}`)

    
// Wait for invitation link
const invitationLinkLocator = page
  .locator("text=/https:\\/\\/growgreat-qa-api\\.azurewebsites\\.net\\/.+/")
  .first();

await invitationLinkLocator.waitFor({
  state: "visible",
  timeout: 30000,
});

const invitationLink = (await invitationLinkLocator.textContent()).trim();

console.log("Invitation Link:", invitationLink);

// Open registration page
const invitePage = await context.newPage();

await invitePage.goto(invitationLink, {
  waitUntil: "domcontentloaded",
});

// Wait until page has loaded
await invitePage
  .locator('input[name="cellphone"]')
  .waitFor({ state: "visible", timeout: 30000 });

console.log("Invitation page opened successfully");

// Click "Enter Passport number instead"
const invitePassportButton = invitePage.locator(
  'p:text-is("Enter Passport number instead")'
);

await invitePassportButton.waitFor({
  state: "visible",
  timeout: 30000,
});

await invitePassportButton.click();

console.log("Passport button clicked");

// Wait for passport input to appear
const passportInput = invitePage.locator('input[name="username"]');

await passportInput.waitFor({
  state: "visible",
  timeout: 30000,
});

await passportInput.fill(CHW.passportNumber);

console.log("Passport entered");

// Cellphone
const cellphoneInput = invitePage.locator('input[name="cellphone"]');

await cellphoneInput.waitFor({
  state: "visible",
  timeout: 30000,
});

await cellphoneInput.fill(CHW.phoneNumber);

console.log("Phone entered");

// Password
const passwordInput = invitePage.locator('input[name="password"]');

await passwordInput.waitFor({
  state: "visible",
  timeout: 30000,
});

await passwordInput.fill("Tester_12");

console.log("Password entered");

// Accept terms
await invitePage
  .locator('input[name="termsAndConditionsAccepted"]')
  .check();

// Accept POPIA
await invitePage
  .locator('input[name="dataPermissionAgreementAccepted"]')
  .check();

console.log("Checkboxes checked");

// Sign up
const signUpButton = invitePage.locator("#gtm-register");

await signUpButton.waitFor({
  state: "visible",
  timeout: 30000,
});

await signUpButton.click();

console.log("Clicked Sign Up");
await page.waitForTimeout(5000);



await invitePage.getByRole("button", { name: "Start" }).click();
console.log("Clicked Start button");

// ===== Select Language =====

// Open the language dropdown
const languageDropdown = invitePage.getByRole("button", {
  name: /Tap to choose language/i,
});

await languageDropdown.waitFor({
  state: "visible",
  timeout: 30000,
});

await languageDropdown.click();
console.log("Opened language dropdown");

// Select English
const englishOption = invitePage.getByText("English", { exact: true });

await englishOption.waitFor({
  state: "visible",
  timeout: 30000,
});

await englishOption.click();
console.log("Selected English");
await page.waitForTimeout(5000);


// Click Next
const nextButton = invitePage.getByRole("button", {
  name: "Next",
});

await nextButton.waitFor({
  state: "visible",
  timeout: 30000,
});

await nextButton.click();
console.log("Clicked Next");

// Click Skip
const skipButton = invitePage.getByRole("button", {
  name: "Skip",
});

await skipButton.waitFor({
  state: "visible",
  timeout: 30000,
});

await skipButton.click();
console.log("Clicked Skip");
await page.waitForTimeout(5000);

// Wait a few seconds to observe result
await invitePage.waitForTimeout(5000);


    // Step 9: Screenshot
    await page.screenshot({ path: "post_click_user.png", fullPage: true })
    console.log("Screenshot saved as post_click_user.png")

    // Step 10: Open a child folder and register a new child
    await invitePage.getByText("Client folders", { exact: true }).click()
    await invitePage.waitForTimeout(2000)
    console.log("Opened Client folders")

    await invitePage.getByText("Open a new folder", { exact: true }).click()
    await invitePage.waitForTimeout(2000)
    console.log("Clicked Open a new folder")

    await invitePage.getByText("Child", { exact: true }).click()
    await invitePage.waitForTimeout(2000)
    console.log("Clicked Child")

    await invitePage.getByRole("button", { name: "Start" }).click()
    console.log("Started child registration form")

    // ===== Child registration (5-month-old child) =====
    const dob = new Date()
    dob.setMonth(dob.getMonth() - 5)
    const dobDay = String(dob.getDate())
    const dobMonthName = dob.toLocaleString("en-US", { month: "short" })
    const dobYear = String(dob.getFullYear())
    console.log(`Target child DOB (5 months old): ${dobDay} ${dobMonthName} ${dobYear}`)

    const childExtraHandler = async ({ invitePage, bodyText }) => {
      // Multi-child question (step 1)
      if (bodyText.includes("more than one child")) {
        await invitePage.getByText("No", { exact: true }).click({ force: true }).catch(() => {})
        await invitePage.waitForTimeout(500)
      }

      // Date of birth: try <select> elements first, then custom dropdown buttons
      if (bodyText.match(/date of birth|birth date/i)) {
        const selects = invitePage.locator("select")
        const selectCount = await selects.count()
        if (selectCount >= 3) {
          await selects.nth(0).selectOption({ label: dobDay.padStart(2, "0") }).catch(async () => {
            await selects.nth(0).selectOption(dobDay).catch(() => {})
          })
          await selects.nth(1).selectOption({ label: dobMonthName }).catch(async () => {
            await selects.nth(1).selectOption({ label: dob.toLocaleString("en-US", { month: "long" }) }).catch(() => {})
          })
          await selects.nth(2).selectOption({ label: dobYear }).catch(() => {})
        } else {
          const dayBtn = invitePage.locator("button", { hasText: /^\d{1,2}$/ }).first()
          const monthBtn = invitePage.locator("button", {
            hasText: /^(January|February|March|April|May|June|July|August|September|October|November|December)$/,
          }).first()
          const yearBtn = invitePage.locator("button", { hasText: /^\d{4}$/ }).first()

          if ((await dayBtn.count()) > 0) {
            await dayBtn.click().catch(() => {})
            await invitePage.getByText(dobDay, { exact: true }).last().click({ force: true }).catch(() => {})
          }
          if ((await monthBtn.count()) > 0) {
            await monthBtn.click().catch(() => {})
            const fullMonth = dob.toLocaleString("en-US", { month: "long" })
            await invitePage.getByText(fullMonth, { exact: true }).last().click({ force: true }).catch(() => {})
          }
          if ((await yearBtn.count()) > 0) {
            await yearBtn.click().catch(() => {})
            await invitePage.getByText(dobYear, { exact: true }).last().click({ force: true }).catch(() => {})
          }
        }
        console.log(`Set child DOB: ${dobDay} ${dobMonthName} ${dobYear}`)
      }

      // Gender question, if present, default to Male
      if (bodyText.match(/\bgender\b|\bsex\b/i)) {
        const boyOpt = invitePage.getByText("Male", { exact: true }).first()
        if ((await boyOpt.count()) > 0) await boyOpt.click({ force: true }).catch(() => {})
      }

      // Weight/length at birth
      const weightInput = invitePage.locator('input[name="weightAtBirth"]')
      if ((await weightInput.count()) > 0 && (await weightInput.isVisible().catch(() => false))) {
        const val = await weightInput.inputValue().catch(() => "")
        if (!val) await weightInput.fill("3200").catch(() => {})
      }
      const lengthInput = invitePage.locator('input[name="lengthAtBirth"]')
      if ((await lengthInput.count()) > 0 && (await lengthInput.isVisible().catch(() => false))) {
        const val = await lengthInput.inputValue().catch(() => "")
        if (!val) await lengthInput.fill("50").catch(() => {})
      }
    }

    const childResult = await runRegistrationWizard(invitePage, {
      label: "Child registration",
      generatedId,
      CHW,
      namePrefix: "Baby",
      surnamePrefix: "Auto",
      extraStepHandler: childExtraHandler,
    })

    if (childResult.success) {
      await invitePage.screenshot({ path: "child_registered.png", fullPage: true }).catch(() => {})
      console.log(
        `Child ${childResult.firstName} ${childResult.surname} registered (DOB ${dobDay} ${dobMonthName} ${dobYear}, 5 months old). Screenshot: child_registered.png`,
      )
    } else {
      console.log("Child registration did not complete — see log above for the step it stalled on.")
    }

    // ===== Pregnant mom registration =====
    // Navigate back to the home screen directly rather than hunting for a back
    // button — after saving, the app leaves us on the new child's folder page.
    await invitePage.goto("https://growgreat-qa-fe.azurewebsites.net/", { waitUntil: "domcontentloaded" })
    await invitePage.waitForTimeout(2000)

    await invitePage.getByText("Client folders", { exact: true }).click()
    await invitePage.waitForTimeout(2000)
    console.log("Opened Client folders")

    await invitePage.getByText("Open a new folder", { exact: true }).click()
    await invitePage.waitForTimeout(2000)
    console.log("Clicked Open a new folder")

    await invitePage.getByText("Pregnant mom", { exact: true }).click()
    await invitePage.waitForTimeout(2000)
    console.log("Clicked Pregnant mom")

    const momStartBtn = invitePage.getByRole("button", { name: "Start" })
    if ((await momStartBtn.count()) > 0) {
      await momStartBtn.click()
      console.log("Started pregnant mom registration form")
    }

    const momResult = await runRegistrationWizard(invitePage, {
      label: "Pregnant mom registration",
      generatedId,
      CHW,
      namePrefix: "Mom",
      surnamePrefix: "Auto",
    })

    if (momResult.success) {
      await invitePage.screenshot({ path: "pregnant_mom_registered.png", fullPage: true }).catch(() => {})
      console.log(
        `Pregnant mom ${momResult.firstName} ${momResult.surname} registered. Screenshot: pregnant_mom_registered.png`,
      )
    } else {
      console.log("Pregnant mom registration did not complete — see log above for the step it stalled on.")
    }
  } catch (error) {
    console.error("An error occurred:", error)
    await page.screenshot({ path: "error_screenshot.png", fullPage: true })
    if (typeof invitePage !== "undefined") {
      await invitePage.screenshot({ path: "invite_error_screenshot.png", fullPage: true }).catch(() => {})
    }
    console.log("Error screenshot saved as error_screenshot.png")
  } finally {
    await browser.close()
    console.log("Browser closed")
  }
})()
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
async function runRegistrationWizard(invitePage, { label, generatedId, CHW, namePrefix, surnamePrefix, extraStepHandler, photoQuestionChoice = "No", maxSteps = 20 }) {
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

    // Road to Health Book / Maternal Case Record question
    if (
      (bodyText.includes("Does") && bodyText.includes("Road to Health Book")) ||
      (bodyText.includes("Does") && bodyText.includes("Maternal Case Record"))
    ) {
      await invitePage.getByText(photoQuestionChoice, { exact: true }).click({ force: true }).catch(() => {})
      console.log(`Clicked ${photoQuestionChoice} for Road to Health Book / Maternal Case Record question`)
    }

    // "Yes" branch: upload a photo for the RTHB/Maternal Case Record page.
    // The "Tap to add" box must be clicked first — it reveals a Gallery/Camera
    // chooser that (re)mounts the actual <input type="file">; setting files on
    // whatever input exists before that click targets a stale/unwired node.
    if (photoQuestionChoice === "Yes" && bodyText.match(/take a photo/i) && bodyText.includes("Tap to add")) {
      const tapToAddBox = invitePage.getByText("Tap to add", { exact: true }).first()
      if ((await tapToAddBox.count()) > 0) {
        await tapToAddBox.click({ force: true }).catch(() => {})
        await invitePage.waitForTimeout(1000)

        const galleryBtn = invitePage.getByText("Gallery", { exact: true })
        if ((await galleryBtn.count()) > 0 && (await galleryBtn.isVisible().catch(() => false))) {
          await galleryBtn.click({ force: true }).catch(() => {})
          await invitePage.waitForTimeout(500)
        }

        const fileInputs = invitePage.locator('input[type="file"]')
        const fileInputCount = await fileInputs.count()
        if (fileInputCount > 0) {
          const jpegBuffer = Buffer.from(
            "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=",
            "base64",
          )
          await fileInputs
            .last()
            .setInputFiles({ name: "rthb-page.jpg", mimeType: "image/jpeg", buffer: jpegBuffer })
            .catch(() => {})
          console.log(`Uploaded photo (via Tap to add -> Gallery) to file input, ${fileInputCount} file input(s) present`)
          await invitePage.waitForTimeout(2000)
          const stillPrompting = (await invitePage.locator("body").innerText().catch(() => "")).includes("Tap to add")
          console.log(stillPrompting ? "Still showing 'Tap to add' after upload — app may not have accepted the file" : "Upload accepted — 'Tap to add' placeholder cleared")
        } else {
          console.log("No file input found after clicking Tap to add / Gallery")
        }
      }
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

// Walks one activity sub-flow inside the visit "dashboard" screen (e.g. "Care for
// mom", "Pillar 1: Nutrition"). Unlike runRegistrationWizard, there's no Save button
// to end on — success is defined as returning to the dashboard (recognized by its
// "Tap a button below to get started" / "Your summary for this visit" text). Yes/No
// questions default to "No" (the safe/no-symptom answer for health screening
// checklists), and any leftover empty inputs get a generic fallback fill.
async function walkVisitActivity(invitePage, activityLabel, maxSteps = 15) {
  const DASHBOARD_MARKERS = ["Tap a button below to get started", "Your summary for this visit"]
  let lastBodyText = null
  let stuckCount = 0

  for (let step = 1; step <= maxSteps; step++) {
    await invitePage.waitForTimeout(1200)
    const bodyText = await invitePage.locator("body").innerText().catch(() => "")
    console.log(`--- ${activityLabel} step ${step} ---`)
    console.log(bodyText.slice(0, 400))

    if (step > 1 && DASHBOARD_MARKERS.some((marker) => bodyText.includes(marker))) {
      console.log(`${activityLabel}: back at the visit dashboard — activity complete`)
      return true
    }

    stuckCount = bodyText === lastBodyText ? stuckCount + 1 : 0
    lastBodyText = bodyText
    if (stuckCount >= 3) {
      console.log(`${activityLabel}: no progress for ${stuckCount} iterations — stopping`)
      return false
    }

    // Consent-style checkbox: only auto-check when there's exactly one on the page
    // (a single consent tickbox). Multiple checkboxes mean a danger-sign/symptom
    // checklist, where leaving everything unticked is the correct "none" default —
    // ticking the first one by mistake falsely reports a symptom and cascades into
    // referral/urgent-support flows.
    const allCheckboxes = invitePage.locator('input[type="checkbox"]')
    const checkboxCount = await allCheckboxes.count()
    if (checkboxCount === 1) {
      const checkbox = allCheckboxes.first()
      if (!(await checkbox.isChecked().catch(() => true))) {
        await checkbox.check({ force: true }).catch(() => {})
      }
    } else if (checkboxCount > 1 && bodyText.includes("None of the above")) {
      // Symptom/danger-sign checklists render "None of the above" as the last
      // checkbox in the list — some of these screens require a selection before
      // Next/Save enables, so this is the safe "no symptoms" default.
      const noneCheckbox = allCheckboxes.last()
      if (!(await noneCheckbox.isChecked().catch(() => true))) {
        await noneCheckbox.check({ force: true }).catch(() => {})
        console.log(`${activityLabel}: checked "None of the above"`)
      }
    }

    // Generic fallback: fill any empty visible text/number inputs and textareas
    const fillableInputs = invitePage.locator(
      'input[type="text"]:visible, input[type="number"]:visible, input:not([type]):visible, textarea:visible',
    )
    const fillableCount = await fillableInputs.count()
    for (let i = 0; i < fillableCount; i++) {
      const inp = fillableInputs.nth(i)
      const val = await inp.inputValue().catch(() => "")
      if (val) continue
      await inp.fill("Test").catch(() => {})
    }

    // Yes/No questions default to "No" (safe/no-symptom answer)
    if (bodyText.match(/\byes\b/i) && bodyText.match(/\bno\b/i)) {
      const noOption = invitePage.getByText("No", { exact: true }).first()
      if ((await noOption.count()) > 0) await noOption.click({ force: true }).catch(() => {})
    }

    // Known mandatory single-choice questions (not Yes/No) that block Save/Next
    // until an option is picked. Extend this list as new ones are discovered.
    const KNOWN_SINGLE_CHOICE_QUESTIONS = [
      { match: /eat or drink in the last 24 hours/i, answer: "Breast milk only" },
    ]
    for (const { match, answer } of KNOWN_SINGLE_CHOICE_QUESTIONS) {
      if (bodyText.match(match)) {
        const option = invitePage.getByText(answer, { exact: true }).first()
        if ((await option.count()) > 0) {
          await option.click({ force: true }).catch(() => {})
          console.log(`${activityLabel}: answered "${answer}" for known single-choice question`)
        }
      }
    }

    // Advance via whichever forward-moving button is present and enabled.
    // Prefer "Save & Exit" over "Save & book your next visit" so we finish this
    // visit rather than chaining straight into scheduling another one.
    const saveExitBtn = invitePage.getByRole("button", { name: "Save & Exit", exact: true })
    const forwardBtn =
      (await saveExitBtn.count()) > 0 && (await saveExitBtn.isVisible().catch(() => false))
        ? saveExitBtn
        : invitePage.getByRole("button", { name: /^(start|next|done|continue|save|finish)$/i }).first()
    if ((await forwardBtn.count()) > 0 && (await forwardBtn.isVisible().catch(() => false))) {
      const disabled = await forwardBtn.isDisabled().catch(() => true)
      if (!disabled) {
        const btnText = await forwardBtn.textContent().catch(() => "?")
        await forwardBtn.click({ force: true }).catch(() => {})
        console.log(`${activityLabel}: clicked "${btnText}" (step ${step})`)
      } else {
        console.log(`${activityLabel}: forward button present but disabled on step ${step}.`)
      }
    } else {
      console.log(`${activityLabel}: no forward button found on step ${step}.`)
    }
  }

  console.log(`${activityLabel}: exceeded ${maxSteps} steps without returning to the dashboard.`)
  return false
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

    // Step 10: Open a new folder from the Client folders home screen. Navigating
    // to the home URL first (rather than hunting for a back button) is reliable
    // regardless of what screen the previous folder's Save left us on.
    async function openNewFolder(folderType) {
      await invitePage.goto("https://growgreat-qa-fe.azurewebsites.net/", { waitUntil: "domcontentloaded" })
      await invitePage.waitForTimeout(2000)

      await invitePage.getByText("Client folders", { exact: true }).click()
      await invitePage.waitForTimeout(2000)
      console.log("Opened Client folders")

      await invitePage.getByText("Open a new folder", { exact: true }).click()
      await invitePage.waitForTimeout(2000)
      console.log("Clicked Open a new folder")

      await invitePage.getByText(folderType, { exact: true }).click()
      await invitePage.waitForTimeout(2000)
      console.log(`Clicked ${folderType}`)

      const startBtn = invitePage.getByRole("button", { name: "Start" })
      if ((await startBtn.count()) > 0) {
        await startBtn.click()
        console.log(`Started ${folderType} registration form`)
      }
    }

    async function reportResult(result, description, screenshotName) {
      if (result.success) {
        await invitePage.screenshot({ path: screenshotName, fullPage: true }).catch(() => {})
        console.log(`${description} ${result.firstName} ${result.surname} registered. Screenshot: ${screenshotName}`)
      } else {
        console.log(`${description} registration did not complete — see log above for the step it stalled on.`)
      }
    }

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

    // This run opens three folders, in order:
    //   1. Child folder — no RTHB details
    //   2. Pregnant mom folder
    //   3. Child folder — with RTHB details (photo upload + weight/length)

    // ----- Folder 1: Child, no RTHB -----
    await openNewFolder("Child")
    const child1Result = await runRegistrationWizard(invitePage, {
      label: "Child registration (no RTHB)",
      generatedId,
      CHW,
      namePrefix: "BabyNoRTHB",
      surnamePrefix: "Auto",
      extraStepHandler: childExtraHandler,
      photoQuestionChoice: "No",
    })
    await reportResult(child1Result, "Child (no RTHB)", "child_no_rthb_registered.png")

    // ----- Folder 2: Pregnant mom -----
    await openNewFolder("Pregnant mom")
    const momResult = await runRegistrationWizard(invitePage, {
      label: "Pregnant mom registration",
      generatedId,
      CHW,
      namePrefix: "Mom",
      surnamePrefix: "Auto",
    })
    await reportResult(momResult, "Pregnant mom", "pregnant_mom_registered.png")

    // ----- Folder 3: Child, with RTHB details -----
    await openNewFolder("Child")
    const child2Result = await runRegistrationWizard(invitePage, {
      label: "Child registration (with RTHB)",
      generatedId,
      CHW,
      namePrefix: "BabyRTHB",
      surnamePrefix: "Auto",
      extraStepHandler: childExtraHandler,
      photoQuestionChoice: "Yes",
    })
    await reportResult(child2Result, "Child (with RTHB)", "child_with_rthb_registered.png")

    // ===== EXPLORATION: record a visit for folder 3 (Child with RTHB) =====
    if (child2Result.success) {
      // The tour is a two-step tooltip sequence: "No, skip" leads to a second
      // "Ok, you can always get help..." tooltip with its own Close button. Both
      // must be dismissed or the overlay swallows the next click.
      const skipTourBtn = invitePage.getByText("No, skip", { exact: true })
      if ((await skipTourBtn.count()) > 0 && (await skipTourBtn.isVisible().catch(() => false))) {
        await skipTourBtn.click().catch(() => {})
        console.log("Dismissed client folders tour popup (step 1)")
        await invitePage.waitForTimeout(1000)
      }
      const closeTourBtn = invitePage.getByRole("button", { name: "Close" })
      if ((await closeTourBtn.count()) > 0 && (await closeTourBtn.isVisible().catch(() => false))) {
        await closeTourBtn.click().catch(() => {})
        console.log("Dismissed client folders tour popup (step 2)")
        await invitePage.waitForTimeout(1000)
      }

      const folderRow = invitePage.getByText(child2Result.firstName, { exact: false }).first()
      await folderRow.click({ force: true }).catch(() => {})
      await invitePage.waitForTimeout(2000)
      console.log("--- Opened child (RTHB) folder page ---")
      console.log(await invitePage.locator("body").innerText().catch(() => ""))
      await invitePage.screenshot({ path: "child_rthb_folder.png", fullPage: true }).catch(() => {})

      const folderButtons = await invitePage.locator("button").evaluateAll((els) =>
        els.map((el) => el.textContent?.trim().slice(0, 40)).filter(Boolean),
      )
      console.log("Folder page buttons:", JSON.stringify(folderButtons))

      const visitButton = invitePage.locator("button", { hasText: /visit/i }).first()
      if ((await visitButton.count()) > 0) {
        const visitButtonText = await visitButton.textContent()
        console.log("Found visit button:", visitButtonText)
        await visitButton.click({ force: true }).catch(() => {})
        await invitePage.waitForTimeout(2000)
        console.log("--- After clicking visit button (Visits tab) ---")
        console.log(await invitePage.locator("body").innerText().catch(() => ""))
        await invitePage.screenshot({ path: "child_rthb_visit_start.png", fullPage: true }).catch(() => {})

        // The Visits tab has its own two-step tour popup, same pattern as before
        const visitSkipTourBtn = invitePage.getByText("No, skip", { exact: true })
        if ((await visitSkipTourBtn.count()) > 0 && (await visitSkipTourBtn.isVisible().catch(() => false))) {
          await visitSkipTourBtn.click().catch(() => {})
          console.log("Dismissed visits tab tour popup (step 1)")
          await invitePage.waitForTimeout(1000)
        }
        const visitCloseTourBtn = invitePage.getByRole("button", { name: "Close" })
        if ((await visitCloseTourBtn.count()) > 0 && (await visitCloseTourBtn.isVisible().catch(() => false))) {
          await visitCloseTourBtn.click().catch(() => {})
          console.log("Dismissed visits tab tour popup (step 2)")
          await invitePage.waitForTimeout(1000)
        }

        // Start the currently-due visit (e.g. "Day 3 visit")
        const startVisitBtn = invitePage.getByRole("button", { name: /start visit/i }).first()
        if ((await startVisitBtn.count()) > 0) {
          await startVisitBtn.click().catch(() => {})
          console.log("Clicked Start visit")
          await invitePage.waitForTimeout(2000)
          console.log("--- After clicking Start visit ---")
          console.log(await invitePage.locator("body").innerText().catch(() => ""))
          await invitePage.screenshot({ path: "child_rthb_visit_form.png", fullPage: true }).catch(() => {})
        } else {
          console.log("No 'Start visit' button found on the Visits tab.")
        }

        // The visit is a dashboard of activity categories rather than a linear
        // form — walk each one (returning to the dashboard between them) then
        // look for however the app lets us finish/submit the whole visit.
        // "Follow up" only appears once the first four are done, which is fine
        // since it's processed last in this sequence.
        const activityLabels = [
          "Care for mom",
          "Care for baby",
          "Pillar 1: Nutrition",
          "Pillar 5: Extra care",
          "Follow up",
        ]
        const activityOutcomes = {}
        for (const activityLabel of activityLabels) {
          const activityButton = invitePage.getByText(activityLabel, { exact: true }).first()
          if ((await activityButton.count()) === 0) {
            console.log(`Activity button "${activityLabel}" not found on dashboard — skipping`)
            activityOutcomes[activityLabel] = false
            continue
          }
          await activityButton.click({ force: true }).catch(() => {})
          console.log(`\n=== Starting activity: ${activityLabel} ===`)
          const completed = await walkVisitActivity(invitePage, activityLabel)
          activityOutcomes[activityLabel] = completed
          await invitePage.waitForTimeout(1000)
        }
        console.log("Activity outcomes:", JSON.stringify(activityOutcomes))

        await invitePage.screenshot({ path: "visit_activities_done.png", fullPage: true }).catch(() => {})
        console.log("--- Visit dashboard after all activities ---")
        console.log(await invitePage.locator("body").innerText().catch(() => ""))

        // Once every activity is done, the app auto-completes the visit and shows
        // a "Well done" summary — there's no separate finish/submit button to click,
        // just "Back to client profile" to close out.
        const dashboardText = await invitePage.locator("body").innerText().catch(() => "")
        if (dashboardText.match(/well done|completing all activities/i)) {
          console.log("Visit fully recorded — app shows the 'Well done' completion summary.")
          const backToProfileBtn = invitePage.getByRole("button", { name: /back to client profile/i })
          if ((await backToProfileBtn.count()) > 0) {
            await backToProfileBtn.click({ force: true }).catch(() => {})
            console.log("Clicked 'Back to client profile'")
            await invitePage.waitForTimeout(1500)
          }
          await invitePage.screenshot({ path: "child_rthb_visit_recorded.png", fullPage: true }).catch(() => {})
          console.log("Screenshot: child_rthb_visit_recorded.png")
        } else {
          console.log("Visit did not reach the 'Well done' completion state — see log/screenshot above for what's there.")
        }
      } else {
        console.log("No visit-related button found on folder page — see log/screenshot above for what's there.")
      }
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
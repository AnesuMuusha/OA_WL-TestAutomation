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
  clinicLabel: "Mamanyoha",
}

// The name column renders as "<firstName> <surname>"
const fullName = `${CHW.firstName} ${CHW.surname}`

const RUN_EXISTING_FOLDERS = true

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

    // Multi-child variant of the same step: "Please choose the client:" — either
    // a relabeled relationship picker, or a picker for which of the registered
    // children this caregiver applies to (in which case, select all of them,
    // since it's the same caregiver for every child in this folder).
    if (bodyText.includes("Please choose the client")) {
      await invitePage.getByText("Please choose the client", { exact: false }).first().click({ force: true }).catch(() => {})
      await invitePage.waitForTimeout(500)

      const motherOption = invitePage.getByText("Mother", { exact: true })
      if ((await motherOption.count()) > 0 && (await motherOption.isVisible().catch(() => false))) {
        await motherOption.click({ force: true }).catch(() => {})
        console.log("Picked Mother for 'Please choose the client' relationship")
      } else {
        // Assume a checklist of children — select every unchecked one
        const clientCheckboxes = invitePage.locator('input[type="checkbox"]:visible')
        const clientCheckboxCount = await clientCheckboxes.count()
        for (let i = 0; i < clientCheckboxCount; i++) {
          const cb = clientCheckboxes.nth(i)
          if (!(await cb.isChecked().catch(() => true))) {
            await cb.check({ force: true }).catch(() => {})
          }
        }
        if (clientCheckboxCount > 0) {
          console.log(`Checked ${clientCheckboxCount} client(s) for 'Please choose the client'`)
        }
        const confirmBtn = invitePage.getByRole("button", { name: /^(done|confirm|select|save)$/i }).first()
        if ((await confirmBtn.count()) > 0 && (await confirmBtn.isVisible().catch(() => false))) {
          await confirmBtn.click({ force: true }).catch(() => {})
        }
      }
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

    // Known numeric fields with a specific expected value/range — filled before
    // the generic fallback so they don't get a generic placeholder number instead.
    const KNOWN_NUMERIC_FIELDS = [{ match: /mid-upper arm circumference/i, value: "30" }]
    for (const { match, value } of KNOWN_NUMERIC_FIELDS) {
      if (bodyText.match(match)) {
        const numericInput = invitePage
          .locator('input[type="text"]:visible, input[type="number"]:visible, input:not([type]):visible')
          .first()
        if ((await numericInput.count()) > 0) {
          const currentVal = await numericInput.inputValue().catch(() => "")
          if (!currentVal) {
            await numericInput.fill(value).catch(() => {})
            console.log(`${activityLabel}: filled known numeric field with "${value}"`)
          }
        }
      }
    }

    // Generic fallback: fill any empty visible text/number inputs and textareas.
    const fillableInputs = invitePage.locator(
      'input[type="text"]:visible, input[type="number"]:visible, input:not([type]):visible, textarea:visible',
    )
    const fillableCount = await fillableInputs.count()
    for (let i = 0; i < fillableCount; i++) {
      const inp = fillableInputs.nth(i)
      const val = await inp.inputValue().catch(() => "")
      if (val) continue
      const type = await inp.getAttribute("type").catch(() => null)
      await inp.fill(type === "number" ? "25" : "Test").catch(() => {})
    }

    // Yes/No questions default to "No" (safe/no-symptom answer). Some screens
    // (e.g. "Maternal distress screening") stack multiple Yes/No question pairs
    // on one page — click every "No" option present, not just the first, or the
    // later questions stay unanswered and Next never enables.
    if (bodyText.match(/\byes\b/i) && bodyText.match(/\bno\b/i)) {
      const noOptions = invitePage.getByText("No", { exact: true })
      const noCount = await noOptions.count()
      for (let i = 0; i < noCount; i++) {
        await noOptions.nth(i).click({ force: true }).catch(() => {})
      }
    }

    // Known mandatory single-choice questions (not Yes/No) that block Save/Next
    // until an option is picked. Extend this list as new ones are discovered.
    const KNOWN_SINGLE_CHOICE_QUESTIONS = [
      { match: /eat or drink in the last 24 hours/i, answer: "Breast milk only" },
      { match: /how many drinks does it take to make you high/i, answer: "NA" },
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

// Dashboard chrome that's never an activity category — filtered out when scanning
// for category buttons on the visit dashboard.
const VISIT_DASHBOARD_CHROME = new Set([
  "Client type",
  "Age",
  "Sort by",
  "Open a folder",
  "Close",
  "See completed activities",
  "Hide completed activities",
  "Back to client profile",
  "Yes, help me!",
  "No, skip",
  // Form-control labels from inside an activity sub-wizard — if one stalls and
  // leaves e.g. a "Next" button on screen, it must never be mistaken for a new
  // activity category on the next scrape.
  "Next",
  "Save",
  "Start",
  "Done",
  "Continue",
  "Finish",
  "Save & Exit",
  "Save & book your next visit",
])

// Opens a client folder by name, starts its currently-due visit, and walks
// whatever activity categories the dashboard presents — discovering them as it
// goes (e.g. "Follow up" only appears once earlier ones are done) rather than
// assuming a fixed list, since different folder types (child vs. pregnant mom)
// show different categories. Returns true once the app shows its "Well done"
// completion summary.
async function recordVisitForFolder(invitePage, { personFirstName, resultLabel, screenshotPrefix, maxRounds = 8 }) {
  // Self-contained: always start from the home screen's Client folders list,
  // regardless of what page a previous call in the same run left us on.
  await invitePage.goto("https://growgreat-qa-fe.azurewebsites.net/", { waitUntil: "domcontentloaded" })
  await invitePage.waitForTimeout(2000)
  await invitePage.getByText("Client folders", { exact: true }).click().catch(() => {})
  await invitePage.waitForTimeout(2000)

  // "Client folders" opens the "What do you want to do?" menu — use "Find a
  // client folder" to search for this specific person rather than assuming a
  // Clients list of every folder is already on screen.
  const findFolderBtn = invitePage.getByText("Find a client folder", { exact: true })
  if ((await findFolderBtn.count()) > 0 && (await findFolderBtn.isVisible().catch(() => false))) {
    await findFolderBtn.click({ force: true }).catch(() => {})
    console.log(`${resultLabel}: clicked Find a client folder`)
    await invitePage.waitForTimeout(2000)
  } else {
    console.log(`${resultLabel}: 'Find a client folder' not found — trying to proceed anyway`)
  }

  // The client folders tour is a two-step tooltip sequence: "No, skip" leads to a
  // second "Ok, you can always get help..." tooltip with its own Close button.
  // Both must be dismissed or the overlay swallows the next click.
  const skipTourBtn = invitePage.getByText("No, skip", { exact: true })
  if ((await skipTourBtn.count()) > 0 && (await skipTourBtn.isVisible().catch(() => false))) {
    await skipTourBtn.click().catch(() => {})
    console.log(`${resultLabel}: dismissed client folders tour popup (step 1)`)
    await invitePage.waitForTimeout(1000)
  }
  const closeTourBtn = invitePage.getByRole("button", { name: "Close" })
  if ((await closeTourBtn.count()) > 0 && (await closeTourBtn.isVisible().catch(() => false))) {
    await closeTourBtn.click().catch(() => {})
    console.log(`${resultLabel}: dismissed client folders tour popup (step 2)`)
    await invitePage.waitForTimeout(1000)
  }

  // Search by name if a search input is present, then click the matching folder
  const searchInput = invitePage.locator('input[type="text"], input[type="search"]').first()
  if ((await searchInput.count()) > 0 && (await searchInput.isVisible().catch(() => false))) {
    await searchInput.fill(personFirstName).catch(() => {})
    console.log(`${resultLabel}: searched for "${personFirstName}"`)
    await invitePage.waitForTimeout(1500)
  }

  const folderRow = invitePage.getByText(personFirstName, { exact: false }).first()
  await folderRow.click({ force: true }).catch(() => {})
  await invitePage.waitForTimeout(2000)
  console.log(`${resultLabel}: opened folder page`)

  const visitButton = invitePage.locator("button", { hasText: /visit/i }).first()
  if ((await visitButton.count()) === 0) {
    console.log(`${resultLabel}: no visit-related button found on folder page`)
    await invitePage.screenshot({ path: `${screenshotPrefix}_no_visit_button.png`, fullPage: true }).catch(() => {})
    return false
  }
  await visitButton.click({ force: true }).catch(() => {})
  await invitePage.waitForTimeout(2000)
  console.log(`${resultLabel}: opened Visits tab`)

  // The Visits tab has its own two-step tour popup, same pattern as above
  const visitSkipTourBtn = invitePage.getByText("No, skip", { exact: true })
  if ((await visitSkipTourBtn.count()) > 0 && (await visitSkipTourBtn.isVisible().catch(() => false))) {
    await visitSkipTourBtn.click().catch(() => {})
    console.log(`${resultLabel}: dismissed visits tab tour popup (step 1)`)
    await invitePage.waitForTimeout(1000)
  }
  const visitCloseTourBtn = invitePage.getByRole("button", { name: "Close" })
  if ((await visitCloseTourBtn.count()) > 0 && (await visitCloseTourBtn.isVisible().catch(() => false))) {
    await visitCloseTourBtn.click().catch(() => {})
    console.log(`${resultLabel}: dismissed visits tab tour popup (step 2)`)
    await invitePage.waitForTimeout(1000)
  }

  const startVisitBtn = invitePage.getByRole("button", { name: /start visit/i }).first()
  if ((await startVisitBtn.count()) === 0) {
    console.log(`${resultLabel}: no 'Start visit' button found on the Visits tab`)
    await invitePage.screenshot({ path: `${screenshotPrefix}_no_start_visit.png`, fullPage: true }).catch(() => {})
    return false
  }
  await startVisitBtn.click().catch(() => {})
  console.log(`${resultLabel}: clicked Start visit`)
  await invitePage.waitForTimeout(2000)

  // Dynamically discover and walk activity categories, round by round, until the
  // dashboard shows the "Well done" completion summary or nothing new appears.
  const triedLabels = new Set()
  for (let round = 1; round <= maxRounds; round++) {
    const dashboardText = await invitePage.locator("body").innerText().catch(() => "")
    if (dashboardText.match(/well done|completing all activities/i)) {
      console.log(`${resultLabel}: dashboard shows completion summary`)
      break
    }

    // Dashboard category tiles are clickable <div> rows (Tailwind "cursor-pointer"),
    // not <button> elements — unlike the Next/Save/Start controls inside each
    // activity's own sub-wizard, which are real buttons. Some tiles (e.g. "Follow
    // up") bundle a subtitle line into the same container, so take just the first
    // visible line as the label rather than the whole blob.
    const candidateTexts = await invitePage.evaluate(() => {
      const els = Array.from(document.querySelectorAll('button, [class*="cursor-pointer"]'))
      return els
        .map((el) => (el.innerText || "").split("\n")[0]?.trim())
        .filter((text) => text && text.length <= 40)
    })
    const nextLabel = candidateTexts.find((text) => !VISIT_DASHBOARD_CHROME.has(text) && !triedLabels.has(text))

    if (!nextLabel) {
      console.log(`${resultLabel}: no new activity categories found on round ${round} — stopping`)
      break
    }

    triedLabels.add(nextLabel)
    const activityButton = invitePage.getByText(nextLabel, { exact: true }).first()
    await activityButton.click({ force: true }).catch(() => {})
    console.log(`\n=== ${resultLabel}: starting activity: ${nextLabel} ===`)
    const activityCompleted = await walkVisitActivity(invitePage, `${resultLabel} / ${nextLabel}`)

    // Some visit types (e.g. pregnant mom) don't return to a "Well done" activity
    // dashboard after the last activity's Save & Exit — they redirect straight to
    // the folder's profile/Visits tab instead, recognizable by its new "Past
    // visits" section. Treat that as the visit having completed successfully.
    const postActivityText = await invitePage.locator("body").innerText().catch(() => "")
    if (postActivityText.includes("Past visits")) {
      console.log(`${resultLabel}: landed on folder profile after "${nextLabel}" — visit complete`)
      await invitePage.screenshot({ path: `${screenshotPrefix}_recorded.png`, fullPage: true }).catch(() => {})
      console.log(`${resultLabel}: screenshot saved as ${screenshotPrefix}_recorded.png`)
      return true
    }

    if (!activityCompleted) {
      // Don't keep scraping — we're likely still stuck mid-activity, and the next
      // scrape would pick up a stray in-page control (e.g. a "No" radio option)
      // and mistake it for a new top-level category.
      console.log(`${resultLabel}: activity "${nextLabel}" did not complete — stopping visit walk for inspection`)
      break
    }
    await invitePage.waitForTimeout(1000)
  }

  const finalText = await invitePage.locator("body").innerText().catch(() => "")
  await invitePage.screenshot({ path: `${screenshotPrefix}_dashboard.png`, fullPage: true }).catch(() => {})

  if (!finalText.match(/well done|completing all activities/i)) {
    console.log(`${resultLabel}: visit did not reach the 'Well done' completion state — see log/screenshot above.`)
    return false
  }

  console.log(`${resultLabel}: visit fully recorded — app shows the 'Well done' completion summary.`)
  const backToProfileBtn = invitePage.getByRole("button", { name: /back to client profile/i })
  if ((await backToProfileBtn.count()) > 0) {
    await backToProfileBtn.click({ force: true }).catch(() => {})
    console.log(`${resultLabel}: clicked 'Back to client profile'`)
    await invitePage.waitForTimeout(1500)
  }
  await invitePage.screenshot({ path: `${screenshotPrefix}_recorded.png`, fullPage: true }).catch(() => {})
  console.log(`${resultLabel}: screenshot saved as ${screenshotPrefix}_recorded.png`)
  return true
}

;(async () => {
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    // Step 1: Navigate to landing page
    console.log("Navigating to landing page...")
    await page.goto("https://chwconnect-staging-portal.azurewebsites.net/", {
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

    await page.selectOption(clinicSelect, { label: CHW.clinicLabel })

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

    // Per-child Details step (name is handled generically elsewhere) — shared by
    // both the single-child and multi-child flows, since the multi-child wizard
    // repeats this same step once per child.
    const childDetailsHandler = async ({ invitePage, bodyText }) => {
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

    // Single-child flow: answer "No" to "more than one child", then the shared
    // per-child details.
    const childExtraHandler = async ({ invitePage, bodyText }) => {
      if (bodyText.includes("more than one child")) {
        await invitePage.getByText("No", { exact: true }).click({ force: true }).catch(() => {})
        await invitePage.waitForTimeout(500)
      }
      await childDetailsHandler({ invitePage, bodyText })
    }

    // This run opens five folders, in order:
    //   1. Child folder — no RTHB details
    //   2. Pregnant mom folder — no MHB (Maternal Case Record) details
    //   3. Pregnant mom folder — with MHB details (photo upload)
    //   4. Child folder — with RTHB details (photo upload + weight/length)
    //   5. Child folder — 3 children registered together, each with RTHB details

    if (RUN_EXISTING_FOLDERS) {
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

    // ----- Folder 2: Pregnant mom, no MHB -----
    await openNewFolder("Pregnant mom")
    const momResult = await runRegistrationWizard(invitePage, {
      label: "Pregnant mom registration (no MHB)",
      generatedId,
      CHW,
      namePrefix: "MomNoMHB",
      surnamePrefix: "Auto",
      photoQuestionChoice: "No",
    })
    await reportResult(momResult, "Pregnant mom (no MHB)", "pregnant_mom_no_mhb_registered.png")

    // ----- Folder 3: Pregnant mom, with MHB details -----
    await openNewFolder("Pregnant mom")
    const momMhbResult = await runRegistrationWizard(invitePage, {
      label: "Pregnant mom registration (with MHB)",
      generatedId,
      CHW,
      namePrefix: "MomMHB",
      surnamePrefix: "Auto",
      photoQuestionChoice: "Yes",
    })
    await reportResult(momMhbResult, "Pregnant mom (with MHB)", "pregnant_mom_with_mhb_registered.png")

    // ----- Folder 4: Child, with RTHB details -----
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

    // ===== Record a visit for folder 3 (Pregnant mom with MHB) =====
    if (momMhbResult.success) {
      await recordVisitForFolder(invitePage, {
        personFirstName: momMhbResult.firstName,
        resultLabel: "Visit (Pregnant mom with MHB)",
        screenshotPrefix: "pregnant_mom_mhb_visit",
      })
    }

    // ===== Record a visit for folder 4 (Child with RTHB) =====
    if (child2Result.success) {
      await recordVisitForFolder(invitePage, {
        personFirstName: child2Result.firstName,
        resultLabel: "Visit (Child with RTHB)",
        screenshotPrefix: "child_rthb_visit",
      })
    }
    } // end RUN_EXISTING_FOLDERS

    // ----- Folder 5 (EXPLORATION): 3 children at once, with RTHB details -----
    await openNewFolder("Child")

    const multiChildExtraHandler = async ({ invitePage, bodyText }) => {
      // Multi-child question (step 1) -> Yes, to register 3 children together
      if (bodyText.includes("more than one child")) {
        await invitePage.getByText("Yes", { exact: true }).click({ force: true }).catch(() => {})
        console.log("Multi-child folder: answered Yes to 'more than one child'")
        await invitePage.waitForTimeout(500)
      }

      // "How many children?" — must be set explicitly to 3, or the generic
      // fallback fill defaults number inputs to a placeholder value (1). Name
      // attribute matched case-insensitively since the log showed it lowercased.
      const numberOfChildrenInput = invitePage.locator('input[name="numberofchildren" i]')
      if ((await numberOfChildrenInput.count()) > 0 && (await numberOfChildrenInput.isVisible().catch(() => false))) {
        const val = await numberOfChildrenInput.inputValue().catch(() => "")
        if (val !== "3") {
          await numberOfChildrenInput.fill("3").catch(() => {})
          console.log("Multi-child folder: set number of children to 3")
        }
      }

      // Reuse the same per-child DOB/gender/weight/length handling used for a
      // single child — the multi-child flow repeats this same "Child Details"
      // step once per child.
      await childDetailsHandler({ invitePage, bodyText })
    }

    const multiChildResult = await runRegistrationWizard(invitePage, {
      label: "Multi-child registration (3 children, RTHB)",
      generatedId,
      CHW,
      namePrefix: "TripletA",
      surnamePrefix: "Auto",
      extraStepHandler: multiChildExtraHandler,
      photoQuestionChoice: "Yes",
    })
    await reportResult(multiChildResult, "Multi-child (3, RTHB)", "multi_child_registered.png")

    // ----- Folders 6-8: three more separate Pregnant mom folders (no MHB) -----
    for (let i = 1; i <= 3; i++) {
      await openNewFolder("Pregnant mom")
      const extraMomResult = await runRegistrationWizard(invitePage, {
        label: `Pregnant mom registration (extra ${i})`,
        generatedId,
        CHW,
        namePrefix: `MomExtra${i}`,
        surnamePrefix: "Auto",
        photoQuestionChoice: "No",
      })
      await reportResult(extraMomResult, `Pregnant mom (extra ${i})`, `pregnant_mom_extra${i}_registered.png`)
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
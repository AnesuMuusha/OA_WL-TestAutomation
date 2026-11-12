// Shared QA sign-up + preschool setup, the same steps OAQA5 starts with:
// phone + OTP, username/password, "Stay in touch" pop-up, PIN, principal
// profile, preschool name, Class 1, then Skip. Leaves the page on the app's
// home screen, ready for a test to carry on from.
const path = require("path")
const testdata = require("./testdata")
const { setPinIfPrompted } = require("../pinSetup")

async function signUpAndSetUpPreschool(page, username, screenshotsDir) {
  console.log("Navigating to landing page...")
  await page.goto("https://ecdconnect-qa-app.azurewebsites.net/", {
    timeout: 50000,
    waitUntil: "domcontentloaded",
  })

  console.log("Clicking Sign up button...")
  await page.getByRole("button", { name: "Sign up" }).click()
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 })

  console.log("Entering phone number...")
  await page.getByPlaceholder("e.g 0123456789").fill(testdata.practitionerPhone)

  await page.locator("input[type='checkbox']").first().click({ timeout: 5000 }).catch(() => {})
  await page.locator("input[type='checkbox']").nth(1).click({ timeout: 5000 }).catch(() => {})
  await page.getByText("Yes", { exact: true }).click({ force: true, timeout: 5000 }).catch(() => {})
  await page.getByRole("button", { name: "Next" }).click({ force: true, timeout: 5000 }).catch(() =>
    page.getByText("Next").click({ force: true })
  )

  console.log("Waiting for OTP screen...")
  await page.getByText("Enter your 6 digit code").waitFor({ timeout: 15000 }).catch(() => {})
  const otpBannerText = await page.getByText(/testing only.*code:/i).innerText().catch(() => "")
  const otpMatch = otpBannerText.match(/(\d{6})/)
  if (otpMatch) {
    console.log(`Filling OTP code ${otpMatch[1]}...`)
    await page.getByPlaceholder("------").fill(otpMatch[1])
    await page.getByRole("button", { name: "Confirm" }).click()
    await page.waitForTimeout(2000)
  } else {
    console.log("Could not read testing OTP code from page; falling back to fixed wait.")
    await page.waitForTimeout(30000)
  }

  console.log(`Creating username ${username}...`)
  await page.click('button:has-text("Create a username")')
  await page.fill('input[name="password"]', "Tester_12")
  await page.fill('input[placeholder="e.g. Nothando_123"]', username)
  await page.waitForTimeout(3000)
  await page.getByRole("button", { name: "Sign up", exact: true }).click()
  await page.waitForTimeout(4000)

  // "Stay in touch" pop-up opens on top of the PIN screen and blocks the
  // keypad, so it has to be answered first
  await page.waitForSelector('[data-headlessui-state="open"]', { timeout: 10000 })
  await page.getByRole("button", { name: "Yes" }).click()
  await page.waitForTimeout(1000)
  await setPinIfPrompted(page, screenshotsDir)

  console.log("Setting up principal profile and preschool...")
  await page.click('button.cursor-pointer.inline-flex:has-text("Get started")')
  await page.click('p.font-semibold.text-sm:has-text("Start")')
  await page.click('p.font-medium.text-textMid.font-h4:has-text("Principal")')
  await page.fill('input[placeholder="First name"]', username)
  await page.click('p.font-semibold.text-xs:has-text("Enter passport number instead")')
  await page.fill('input[placeholder="e.g. A012345"]', username)
  await page.click('p.font-semibold.text-sm:has-text("Next")')
  await page.fill('input[placeholder="E.g. Little Lambs Preschool"]', "QATest")
  await page.click('p.text-sm.font-h1.font-normal:has-text("Next")')

  console.log("Adding Class 1...")
  await page.click('p.text-sm.font-h1.font-normal:has-text("Add class")')
  await page.click('div.font-body.p-3.text-sm.font-medium:has-text("Yes")')
  await page.getByText("Save").click()
  await page.waitForTimeout(3000)
  await page.getByRole("button", { name: "Next" }).click()
  await page.waitForTimeout(3000)
  await page.getByText("Skip").click()
  await page.waitForTimeout(3000)
  await page.screenshot({ path: path.join(screenshotsDir, "offline-setup-done.png") }).catch(() => {})
  console.log("Sign-up and preschool setup done")
}

module.exports = { signUpAndSetUpPreschool }

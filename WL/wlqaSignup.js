// Shared WL QA sign-up + preschool setup, the same steps wlqa5 starts with:
// admin portal login → add a practitioner → copy their invite link → sign up
// in the app → PIN → Principal → preschool name → Class 1 → Skip. Returns the
// app page, left on the dashboard.
//
// The browser context needs clipboard access to read the invite link:
//   browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] })
const path = require("path")
const { setPinIfPrompted } = require("../pinSetup")

const PORTAL_URL = "https://whitelabel-qa-portal.azurewebsites.net/"
const PHONE = "0719270935"

async function signUpAndSetUpPreschool(context, page, practitionerId, screenshotsDir) {
  // ── Admin portal: add the practitioner ──
  console.log("=== Portal: logging in as WLAdmin ===")
  await page.goto(PORTAL_URL, { timeout: 60000, waitUntil: "domcontentloaded" })
  await page.fill('input[name="email"]', "WLAdmin")
  await page.fill('input[name="password"]', "ECDConnect123!")
  await page.click('button.bg-secondary:has-text("Log in")')
  await page.waitForTimeout(5000)

  console.log(`=== Portal: adding practitioner ${practitionerId} ===`)
  await page.locator('a[href="/users/practitioners"]').click({ timeout: 20000 })
  await page.waitForTimeout(3000)
  await page.click('p:has-text("Add Practitioners") >> xpath=..')
  await page.click('p:has-text("Add one Practitioner") >> xpath=..')
  await page.fill('input[name="firstName"]', practitionerId)
  await page.fill('input[name="surname"]', "QA")
  await page.fill('input[name="phoneNumber"]', PHONE)
  await page.click('button:has(p:has-text("Passport"))')
  await page.fill('input[name="idNumber"]', practitionerId)
  await page.click('label:has-text("Practitioner\'s coach")', { timeout: 50000 })
  await page.click('button.bg-quatenary:has-text("Save")', { timeout: 100000 })
  await page.waitForTimeout(5000)

  console.log("=== Portal: copying the invite link ===")
  const rowSelector = `tr:has(td:has-text("${practitionerId}"))`
  await page.click(`${rowSelector} button`, { timeout: 15000 })
  await page.waitForTimeout(5000)
  await page.click('p.font-semibold.text-sm.text-white.font-body:has-text("Resend Invitation") >> xpath=..')
  await page.click('p.font-semibold.text-sm.text-secondary.font-body:has-text("Copy the invite URL")')
  await page.waitForTimeout(2000)
  const inviteUrl = await page.evaluate(() => navigator.clipboard.readText())
  if (!inviteUrl || inviteUrl.length < 10) throw new Error(`Invite link not copied (got "${inviteUrl}")`)
  console.log(`Invite link: ${inviteUrl}`)

  // ── App: sign up from the invite link ──
  const appPage = await context.newPage()
  appPage.setDefaultTimeout(30000)
  await appPage.goto(inviteUrl, { waitUntil: "domcontentloaded" })
  await appPage.waitForTimeout(3000)

  console.log("=== App: signing up ===")
  await appPage.getByText("Enter Passport number instead").click()
  await appPage.fill('input[name="username"]', practitionerId)
  await appPage.fill('input[name="cellphone"]', PHONE)
  await appPage.locator('input[name="termsAndConditionsAccepted"]').check()
  await appPage.locator('input[name="dataPermissionAgreementAccepted"]').check()
  await appPage.getByText("Next").click()
  await appPage.waitForTimeout(4000)
  await appPage.getByRole("button", { name: "Create a username" }).click()
  await appPage.fill('input[placeholder="e.g. Nothando_123"]', practitionerId)
  await appPage.fill('input[name="password"]', "Tester_12")
  await appPage.waitForTimeout(3000)
  await appPage.locator('button.bg-quatenary:has-text("Sign up")').click()
    .catch(() => appPage.locator('p:has-text("Sign up")').click({ force: true }))
  await appPage.waitForTimeout(5000)

  const pinSet = await setPinIfPrompted(appPage, screenshotsDir)
  // exact: the PIN confirm screen also has a "Start again" button. Some runs
  // land on the dashboard instead, with a "Join or add a preschool!" card —
  // its "Get started" leads to the same Start screen (as in the OA sign-up).
  await appPage.waitForLoadState("networkidle").catch(() => {})
  const startButton = appPage.getByRole("button", { name: "Start", exact: true })
  await startButton.click({ timeout: 30000 }).catch(async () => {
    console.log(`No Start button after the PIN (at ${appPage.url()}) — tapping "Get started"`)
    await appPage.screenshot({ path: path.join(screenshotsDir, "offline-no-start.png") }).catch(() => {})
    await appPage.getByRole("button", { name: "Get started" }).click()
    await appPage.waitForTimeout(2000)
    await appPage.getByText("Start", { exact: true }).click()
  })
  if (!pinSet) await setPinIfPrompted(appPage, screenshotsDir, 10000)
  await appPage.waitForLoadState("networkidle")
  await appPage.waitForTimeout(5000)

  console.log("=== App: setting up Principal profile and preschool ===")
  await appPage.locator('div.rounded-10:has-text("Principal")').click({ timeout: 15000 })
    .catch(() => appPage.getByText("I run a preschool").click())
  await appPage.waitForTimeout(3000)
  // The "Get started" route asks for the principal's own details first (as in
  // the OA sign-up); the Start-after-PIN route goes straight to the preschool name
  if (await appPage.locator('input[placeholder="First name"]').isVisible().catch(() => false)) {
    console.log("Filling principal's details...")
    await appPage.fill('input[placeholder="First name"]', practitionerId)
    await appPage.click('p.font-semibold.text-xs:has-text("Enter passport number instead")')
    await appPage.fill('input[placeholder="e.g. A012345"]', practitionerId)
    await appPage.click('p.font-semibold.text-sm:has-text("Next")')
    await appPage.waitForTimeout(3000)
  }
  const schoolName = appPage.locator('input[name="name"], input[placeholder="E.g. Little Lambs Preschool"]').first()
  await schoolName.clear()
  await schoolName.fill("TestAuto")
  await appPage.getByText("Next").click()
  await appPage.waitForTimeout(3000)
  // The Start-after-PIN route has an extra Skip before "Add class"
  if (!(await appPage.getByText("Add class").isVisible().catch(() => false))) {
    await appPage.getByText("Skip").click()
    await appPage.waitForTimeout(3000)
  }

  console.log("=== App: adding Class 1 ===")
  await appPage.getByText("Add class").click()
  await appPage.waitForTimeout(3000)
  await appPage.click('div.font-body.p-3.text-sm.font-medium:has-text("Yes")')
  await appPage.getByText("Save").click()
  await appPage.waitForTimeout(3000)
  await appPage.getByRole("button", { name: "Next" }).click()
  await appPage.waitForTimeout(3000)
  await appPage.getByText("Skip").click()
  await appPage.waitForTimeout(3000)
  await appPage.screenshot({ path: path.join(screenshotsDir, "offline-setup-done.png") }).catch(() => {})
  console.log("Sign-up and preschool setup done")
  return appPage
}

module.exports = { signUpAndSetUpPreschool }

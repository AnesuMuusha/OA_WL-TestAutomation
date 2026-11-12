// Shared login step: after sign-up the app shows "Choose a PIN" (4 to 6
// digits) with an on-screen keypad, then "Confirm your PIN" with the same
// keypad. Each screen is a keypad tap per digit, then Continue / Save PIN
// (enabled once 4+ digits are in).
//
// Call setPinIfPrompted(page, screenshotsDir) right where the PIN screen can
// appear. Returns false if no PIN screen shows up within `timeout`.
const path = require("path")

const PIN = "1234"

async function enterPin(currentPage, label) {
  for (const digit of PIN) {
    const key = currentPage.getByRole("button", { name: digit, exact: true })
    if ((await key.count()) > 0) {
      await key.first().click()
    } else {
      await currentPage.getByText(digit, { exact: true }).first().click()
    }
    await currentPage.waitForTimeout(300)
  }
  console.log(`${label}: entered PIN ${PIN}`)
  const continueButton = currentPage.getByRole("button", { name: /^(continue|save pin)$/i }).first()
  if (await continueButton.isVisible().catch(() => false)) {
    const buttonText = await continueButton.innerText()
    await continueButton.click({ timeout: 10000 })
    console.log(`${label}: clicked ${buttonText}`)
  }
  await currentPage.waitForTimeout(2000)
}

async function setPinIfPrompted(currentPage, screenshotsDir, timeout = 20000) {
  const pinScreen = currentPage.getByText(/choose a pin/i).first()
  try {
    await pinScreen.waitFor({ state: "visible", timeout })
  } catch {
    console.log("No PIN screen shown, continuing...")
    return false
  }
  console.log("=== Setting PIN ===")
  await currentPage.screenshot({ path: path.join(screenshotsDir, "pin-set.png") })
  await enterPin(currentPage, "Set PIN")
  console.log("=== Confirming PIN ===")
  await currentPage.screenshot({ path: path.join(screenshotsDir, "pin-confirm.png") })
  await enterPin(currentPage, "Confirm PIN")
  return true
}

module.exports = { PIN, setPinIfPrompted }

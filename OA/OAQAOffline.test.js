const fs = require("fs")
const path = require("path")
const SCREENSHOTS_DIR = path.join(__dirname, "screenshots")
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })
const { logGeneratedUsername } = require("../usernameLog")
const { signUpAndSetUpPreschool } = require("./oaqaSignup")
const { defineOfflineScenarios } = require("../offlineScenarios")

// Persistent counter so every run signs up a fresh account. Names run
// "OAOffline00000001", "OAOffline00000002", ... always incrementing by 1.
const OFFLINE_COUNTER_FILE = path.join(__dirname, ".oa-offline-counter.json")
function nextOfflineId(prefix) {
  let n = 1
  try {
    n = JSON.parse(fs.readFileSync(OFFLINE_COUNTER_FILE, "utf8")).count || 1
  } catch {
    // first run – counter file doesn't exist yet
  }
  fs.writeFileSync(OFFLINE_COUNTER_FILE, JSON.stringify({ count: n + 1 }, null, 2))
  const id = prefix + String(n).padStart(8, "0")
  logGeneratedUsername("QA", "OA/OAQAOffline", id)
  return id
}

// Offline scenarios (add a class, add a child, attendance, income/expense)
// on a fresh OA QA account — see ../offlineScenarios.js
defineOfflineScenarios({
  title: "OA/OAQAOffline",
  screenshotsDir: SCREENSHOTS_DIR,
  signUp: async (context, page) => {
    await signUpAndSetUpPreschool(page, nextOfflineId("OAOffline"), SCREENSHOTS_DIR)
    return page
  },
})

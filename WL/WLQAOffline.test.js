const fs = require("fs")
const path = require("path")
const SCREENSHOTS_DIR = path.join(__dirname, "screenshots")
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })
const { logGeneratedUsername } = require("../usernameLog")
const { signUpAndSetUpPreschool } = require("./wlqaSignup")
const { defineOfflineScenarios } = require("../offlineScenarios")

// Persistent counter so every run invites a fresh practitioner. Names run
// "WLOffline00000001", "WLOffline00000002", ... always incrementing by 1.
const OFFLINE_COUNTER_FILE = path.join(__dirname, ".wl-offline-counter.json")
function nextOfflineId(prefix) {
  let n = 1
  try {
    n = JSON.parse(fs.readFileSync(OFFLINE_COUNTER_FILE, "utf8")).count || 1
  } catch {
    // first run – counter file doesn't exist yet
  }
  fs.writeFileSync(OFFLINE_COUNTER_FILE, JSON.stringify({ count: n + 1 }, null, 2))
  const id = prefix + String(n).padStart(8, "0")
  logGeneratedUsername("QA", "WL/WLQAOffline", id)
  return id
}

// Offline scenarios (add a class, add a child, attendance, income/expense)
// on a fresh WL QA practitioner — see ../offlineScenarios.js
defineOfflineScenarios({
  title: "WL/WLQAOffline",
  screenshotsDir: SCREENSHOTS_DIR,
  // Clipboard access to read the invite link copied in the admin portal
  newContextOptions: {
    permissions: ["clipboard-read", "clipboard-write"],
    viewport: { width: 1280, height: 720 },
  },
  signUp: (context, page) =>
    signUpAndSetUpPreschool(context, page, nextOfflineId("WLOffline"), SCREENSHOTS_DIR),
})

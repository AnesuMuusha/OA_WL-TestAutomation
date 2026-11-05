// Shared append-only log of every test-generated username/id, across all
// test scripts and environments, so they stay easy to find instead of only
// living inside each script's own counter state.
//
// Call logGeneratedUsername(env, script, username) right where a script
// generates an id. Rows append to generated-usernames.csv at the repo root,
// which opens fine in Excel/Sheets and can be sorted/filtered/grouped by the
// Env column.
const fs = require("fs")
const path = require("path")

const LOG_FILE = path.join(__dirname, "generated-usernames.csv")
const HEADER = "Env,Script,Username,Timestamp\n"

function csvEscape(value) {
  const str = String(value)
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

function logGeneratedUsername(env, script, username) {
  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, HEADER)
  }
  const row = [env, script, username, new Date().toISOString()].map(csvEscape).join(",") + "\n"
  fs.appendFileSync(LOG_FILE, row)
}

module.exports = { logGeneratedUsername }

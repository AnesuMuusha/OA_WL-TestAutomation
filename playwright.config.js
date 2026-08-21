const { defineConfig } = require("@playwright/test")

module.exports = defineConfig({
  testDir: ".",
  testMatch: "**/*.test.js",
  timeout: 15 * 60 * 1000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: "list",
})

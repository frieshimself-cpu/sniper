import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3111",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npm run start -- -p 3111",
    url: "http://127.0.0.1:3111/api/stats",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      ADMIN_PASSWORD: "smoke-test",
      VOTE_BALANCE_CHECK: "off",
      CRIME_STATE_DIR: ".data-test",
      CRIME_AGENT_ROOT: "tests/fixture",
      SITE_URL: "http://127.0.0.1:3111",
    },
  },
});

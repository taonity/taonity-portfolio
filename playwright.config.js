import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results/browser",
  fullyParallel: true,
  workers: 2,
  retries: 0,
  timeout: 30_000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4174",
    locale: "en-GB",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop-light",
      use: {
        viewport: { width: 1440, height: 1100 },
        colorScheme: "light",
        deviceScaleFactor: 2,
      },
    },
    {
      name: "desktop-dark",
      use: {
        viewport: { width: 1440, height: 1100 },
        colorScheme: "dark",
        deviceScaleFactor: 2,
      },
    },
    {
      name: "phone-light",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 },
        colorScheme: "light",
        deviceScaleFactor: 1,
      },
    },
    {
      name: "phone-dark",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 },
        colorScheme: "dark",
        deviceScaleFactor: 1,
      },
    },
  ],
  webServer: {
    command: "npm run build && node scripts/serve.mjs",
    url: "http://127.0.0.1:4174",
    env: { PORT: "4174" },
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
  },
});

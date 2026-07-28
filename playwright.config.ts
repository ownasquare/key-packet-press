import { defineConfig, devices } from "@playwright/test";

delete process.env.NO_COLOR;
process.env.FORCE_COLOR = "0";

const projects = [
  {
    name: "desktop-light",
    use: { colorScheme: "light" as const, viewport: { width: 1440, height: 1000 } },
  },
  {
    name: "desktop-dark",
    use: { colorScheme: "dark" as const, viewport: { width: 1440, height: 1000 } },
  },
  {
    name: "tablet-light",
    use: { colorScheme: "light" as const, viewport: { width: 820, height: 1180 } },
  },
  {
    name: "tablet-dark",
    use: { colorScheme: "dark" as const, viewport: { width: 820, height: 1180 } },
  },
  {
    name: "phone-light",
    use: {
      ...devices["iPhone 13"],
      browserName: "chromium" as const,
      colorScheme: "light" as const,
    },
  },
  {
    name: "phone-dark",
    use: {
      ...devices["iPhone 13"],
      browserName: "chromium" as const,
      colorScheme: "dark" as const,
    },
  },
];

export default defineConfig({
  expect: {
    timeout: 8_000,
  },
  fullyParallel: false,
  outputDir: "test-results",
  projects,
  reporter: [["line"]],
  testDir: "tests/e2e",
  use: {
    baseURL: "http://127.0.0.1:4186",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run preview",
    reuseExistingServer: false,
    stderr: "pipe",
    stdout: "pipe",
    timeout: 60_000,
    url: "http://127.0.0.1:4186",
  },
});

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-extension",
  workers: 1,
  use: { browserName: "chromium", headless: true },
});

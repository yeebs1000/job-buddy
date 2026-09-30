import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e", testMatch: "web-core.spec.ts", workers: 1,
  use: { baseURL: "http://127.0.0.1:4174" },
  webServer: [
    { command: "node node_modules/typescript/bin/tsc -b && node node_modules/vite/bin/vite.js build --mode web && node node_modules/vite/bin/vite.js preview --mode web --host 127.0.0.1 --port 4174 --strictPort", url: "http://127.0.0.1:4174", reuseExistingServer: false },
    { command: "node node_modules/vite/bin/vite.js preview --mode web --host 127.0.0.1 --port 4175 --strictPort", url: "http://127.0.0.1:4175", reuseExistingServer: false },
  ],
});

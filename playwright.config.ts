import { defineConfig } from "@playwright/test";
const requestedPort = Number(process.env.JOB_BUDDY_TEST_PORT ?? 4173);
if (!Number.isInteger(requestedPort) || requestedPort < 1024 || requestedPort > 65535) throw new Error("Invalid test port");

export default defineConfig({
  testDir: "./e2e",
  testIgnore: "web-core.spec.ts",
  // Match the installed-extension gate and avoid competing browser instances
  // on the supported memory-constrained Windows test host.
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${requestedPort}`,
  },
  webServer: {
    command: `node ./node_modules/typescript/bin/tsc -b && node ./node_modules/vite/bin/vite.js build && node ./node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${requestedPort} --strictPort`,
    url: `http://127.0.0.1:${requestedPort}`,
    reuseExistingServer: false,
  },
});

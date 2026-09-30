import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    // Run UI suites serially: concurrent JSDOM/table renders cause unrelated
    // five-second timeouts on memory-constrained Windows hosts.
    maxWorkers: 1,
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["e2e/**", "e2e-extension/**", ".worktrees/**", "node_modules/**", "dist/**", "dist-extension/**"],
  },
});

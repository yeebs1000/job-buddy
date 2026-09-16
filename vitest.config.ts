import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    // Bound JSDOM startup contention on the local Windows host.
    maxWorkers: 2,
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["e2e/**", "e2e-extension/**", ".worktrees/**", "node_modules/**", "dist/**", "dist-extension/**"],
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build: { outDir: mode === "web" ? "dist-web" : "dist" },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: mode === "web" ? undefined : {
      "/api": "http://127.0.0.1:43117",
    },
  },
}));

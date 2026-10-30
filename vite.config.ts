import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// The UI is built into dist/, which Cloudflare Pages serves next to functions/api.
// During `npm run dev`, /api is proxied to `wrangler pages dev` (default port 8788).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": process.env.PAGES_DEV_URL ?? "http://localhost:8788",
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});

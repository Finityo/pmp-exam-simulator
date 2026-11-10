import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Standalone build. The app root is client/ (index.html lives there) and
// the production bundle lands in dist/ at the repo root, which is the
// folder Capacitor wraps (webDir in capacitor.config.ts). A relative
// base keeps every asset URL working both from a static web host and
// from the file based serving Capacitor uses inside the native shell.
// assetsInlineLimit 0 keeps all 628 MP3 recordings as real files in
// dist/assets instead of inlining any of them into the JS bundle.
export default defineConfig({
  root: "client",
  base: "./",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 8192,
  },
});

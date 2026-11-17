import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds just the admin page for the desktop app (into dist-electron/renderer).
export default defineConfig({
  root: "electron/renderer",
  base: "./",
  plugins: [react()],
  build: { outDir: "../../dist-electron/renderer", emptyOutDir: true },
});

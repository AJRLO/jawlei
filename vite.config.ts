import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import adminApi from "./admin-api";

export default defineConfig({
  plugins: [react(), adminApi()],
});

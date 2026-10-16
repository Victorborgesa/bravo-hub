import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri espera uma porta fixa e não deve ter o terminal limpo pelo Vite.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: { target: "es2022", outDir: "dist", chunkSizeWarningLimit: 1500 },
});

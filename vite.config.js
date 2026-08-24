import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "https://job-finder-ai-backend-11.onrender.com/",
        changeOrigin: true,
      },
    },
  },
});

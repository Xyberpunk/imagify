import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  // 🚫 Disable SSR completely (IMPORTANT for Vercel)
  ssr: {
    noExternal: true,
  },

  // 🚫 Ensure Vercel never tries to run React on the server
  define: {
    "process.env.SSR": false,
    __DEV__: true,
  },

  // ✔ Make sure build is client-side only
  build: {
    ssr: false,
    target: "esnext",
  },

  // ✔ Avoid Vercel SSR by forcing SPA behavior
  optimizeDeps: {
    include: ["react", "react-dom"],
  },
});

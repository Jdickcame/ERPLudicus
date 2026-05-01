import tailwindcss from "@tailwindcss/vite"; // <--- IMPORTANTE
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // <--- AGREGAR AQUÍ
  ],
});

import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    // The React app calls its own data API at a relative `/api/...` path, so
    // there is no CORS surface and no hard-coded localhost URL to change when
    // you deploy. In dev those calls are proxied to the Express server that
    // `npm run dev` starts alongside Vite.
    //
    // Note this is the TalentPulse data API (MongoDB + RBAC + CV storage) —
    // the three ML backends are still called directly from the components via
    // VITE_API_URL / VITE_MODULE1_API_URL / VITE_MODULE1_RANKING_API_URL /
    // VITE_MODULE2_API_URL, exactly as before.
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.PORT || 5050}`,
        changeOrigin: true,
      },
    },
  },
});

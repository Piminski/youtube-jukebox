import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const youtubeProxy = {
  "/api/youtube": {
    target: "https://www.googleapis.com",
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api\/youtube/, "/youtube/v3"),
    configure: (proxy: {
      on: (event: string, fn: (proxyReq: { setHeader: (k: string, v: string) => void }) => void) => void;
    }) => {
      // HTTP-referrer keys reject LAN IPs and empty referrers. Local proxy
      // always presents the allowed localhost origin to Google.
      proxy.on("proxyReq", (proxyReq) => {
        proxyReq.setHeader("Referer", "http://localhost:5173/");
        proxyReq.setHeader("Origin", "http://localhost:5173");
      });
    },
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: true,
    proxy: youtubeProxy,
  },
  preview: {
    proxy: youtubeProxy,
  },
});

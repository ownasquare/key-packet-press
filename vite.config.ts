import { defineConfig } from "vite";

export default defineConfig({
  build: {
    assetsInlineLimit: 100_000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("/node_modules/pdf-lib/") ||
            id.includes("/node_modules/@pdf-lib/standard-fonts/") ||
            id.includes("/node_modules/pako/")
          ) {
            return "packet-pdf-core";
          }
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 4186,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 4186,
    strictPort: true,
  },
});

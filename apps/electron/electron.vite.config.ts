import { fileURLToPath, URL } from "node:url";
import { resolve } from "node:path";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "electron-vite";

const electronRoot = fileURLToPath(new URL(".", import.meta.url));
const webRoot = resolve(electronRoot, "../web");

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    root: webRoot,
    base: "/",
    plugins: [vue()],
    server: {
      proxy: {
        "/api": "http://127.0.0.1:8000",
        "/ws": {
          target: "ws://127.0.0.1:8000",
          ws: true,
        },
      },
    },
    build: {
      outDir: resolve(electronRoot, "out/renderer"),
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(webRoot, "index.html"),
      },
    },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("../web/src", import.meta.url)),
      },
    },
  },
});

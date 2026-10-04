import { defineConfig } from "@playwright/test";

// 服务由操作者核对/启动；不重启占用端口的进程，不回退到其他端口。
export default defineConfig({
  testDir: "./tests/live",
  testMatch: "default-help.spec.mts",
  workers: 1,
  retries: 0,
  timeout: 120_000,
  use: { baseURL: "http://127.0.0.1:5173", viewport: { width: 1440, height: 960 }, trace: "off" },
});

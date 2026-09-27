import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/live",
  fullyParallel: false,
  timeout: 90_000,
  use: { baseURL: "http://127.0.0.1:4174", viewport: { width: 1440, height: 960 } },
  webServer: [
    {
      command: "pnpm dev:api",
      url: "http://127.0.0.1:8000/api/health",
      reuseExistingServer: true,
    },
    {
      command: "pnpm --filter @industrial/web preview --host 127.0.0.1 --port 4174",
      url: "http://127.0.0.1:4174/editor/demo",
      reuseExistingServer: true,
    },
  ],
});

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:4174",
    viewport: { width: 1440, height: 960 },
  },
  webServer: [
    {
      command: "uv run --python 3.12 alembic upgrade head && uv run --python 3.12 uvicorn industrial_api.main:app --host 127.0.0.1 --port 8000",
      cwd: "services/api",
      url: "http://127.0.0.1:8000/api/health",
      reuseExistingServer: true,
    },
    {
      command: "corepack pnpm@12.4.1 --filter @industrial/web preview --host 127.0.0.1 --port 4174",
      url: "http://127.0.0.1:4174/editor/demo",
      reuseExistingServer: true,
    },
  ],
});

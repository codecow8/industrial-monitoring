import { randomUUID } from "node:crypto";
import { expect, test } from "../auth-fixtures";

for (const action of ["logout", "rotate"] as const) {
  test(`运行态旧登录${action === "logout" ? "退出" : "重登"}后停止旧连接并清理帮助会话`, async ({ browser, request, account }) => {
    const pageId = `runtime-auth-${randomUUID()}`;
    const schema = { version: "1.0.0", id: pageId, name: "连接身份验收", canvas: { width: 1440, height: 900, background: "#0e1d2b" },
      components: [{ id: "temperature", type: "metric-card", position: { x: 275, y: 130 }, size: { width: 300, height: 214 },
        props: { deviceName: "验收泵", title: "出口温度", dataKey: `${pageId}.temperature`, unit: "°C", precision: 1, alarmThreshold: 80 } }] };
    expect((await request.put(`/api/pages/${pageId}/draft`, { data: schema })).ok()).toBe(true);
    expect((await request.post(`/api/pages/${pageId}/publish`)).ok()).toBe(true);
    // 独立登录避免撤销 worker 认证夹具的共享 Token；凭据不写截图或报告。
    const context = await browser.newContext({ baseURL: "http://127.0.0.1:4174", storageState: { cookies: [], origins: [] } });
    try {
      expect((await context.request.post("/api/auth/login", { data: { username: account.username, password: account.password } })).status()).toBe(200);
      const page = await context.newPage();
      await page.route("**/api/help/**", async route => {
        const body = route.request().postDataJSON();
        await route.fulfill({ status: route.request().url().endsWith("/sessions") ? 201 : 200,
          json: route.request().url().endsWith("/sessions") ? { sessionId: "old-owner" }
            : { requestId: body.requestId, answer: "原登录的固定帮助对话", sources: [] } });
      });
      await page.goto(`/runtime/${pageId}`);
      await expect(page.locator(".runtime-state")).toContainText("实时数据已连接");
      await page.getByRole("button", { name: "使用帮助", exact: true }).click();
      const panel = page.getByTestId("help-panel");
      await panel.getByLabel("你的问题").fill("查看说明");
      await panel.getByRole("button", { name: "发送", exact: true }).click();
      await expect(panel).toContainText("原登录的固定帮助对话");
      if (action === "logout") {
        expect((await context.request.post("/api/auth/logout")).status()).toBe(204);
        await expect(page).toHaveURL(/\/login\?/, { timeout: 5000 });
        await expect(panel).toHaveCount(0);
        expect((await context.request.get(`/api/pages/${pageId}/published`)).status()).toBe(401);
      } else {
        expect((await context.request.post("/api/auth/login", { data: { username: account.username, password: account.password } })).status()).toBe(200);
        await expect(panel).toHaveCount(0, { timeout: 5000 });
        await expect(page.locator(".runtime-state")).toContainText("实时数据已连接", { timeout: 5000 });
        await page.getByRole("button", { name: "使用帮助", exact: true }).click();
        await expect(panel.locator(".help-message")).toHaveCount(0);
        expect((await context.request.get(`/api/pages/${pageId}/published`)).status()).toBe(200);
      }
    } finally { await context.close(); }
  });
}

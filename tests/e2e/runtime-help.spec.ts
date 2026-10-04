import { expect, test } from "../auth-fixtures";

function schema(pageId: string) {
  return { version: "1.0.0", id: pageId, name: "运行态帮助验收", canvas: { width: 1440, height: 900, background: "#0e1d2b" },
    components: [{ id: "temperature", type: "metric-card", position: { x: 275, y: 130 }, size: { width: 300, height: 214 },
      props: { deviceName: "验收泵", title: "出口温度", dataKey: `${pageId}.temperature`, unit: "°C", precision: 1, alarmThreshold: 80 } }] };
}

test("运行态帮助跨入口保留，版本通知冻结在途请求，刷新建立新会话", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const pageId = `runtime-help-${Date.now()}`;
  expect((await request.put(`/api/pages/${pageId}/draft`, { data: schema(pageId) })).ok()).toBe(true);
  expect((await request.post(`/api/pages/${pageId}/publish`)).ok()).toBe(true);
  let created = 0, questions = 0;
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/help/**", async route => {
    const body = route.request().postDataJSON();
    if (route.request().url().endsWith("/sessions")) {
      expect(body.pageId).toBe(pageId);
      await route.fulfill({ status: 201, json: { sessionId: `session-${++created}` } });
    } else {
      questions++;
      if (body.question === "等待中的问题") await delayed;
      await route.fulfill({ json: { requestId: body.requestId, answer: "固定接口替身回答", sources: [
        { source: "docs/product-guide.md", title: "测试依据", content: "固定来源正文" },
      ] } });
    }
  });
  await page.goto(`/runtime/${pageId}`);
  await expect(page.getByRole("button", { name: "退出登录" })).toHaveCount(0);
  await page.getByRole("button", { name: "使用帮助", exact: true }).click();
  const panel = page.getByTestId("help-panel");
  await expect(panel).toContainText("当前画面 v1");
  await panel.getByLabel("你的问题").fill("第一问");
  await panel.getByRole("button", { name: "发送", exact: true }).click();
  await expect(panel.locator(".help-message")).toHaveCount(2);
  await page.getByRole("button", { name: "返回编辑器" }).click();
  await expect(panel).toContainText("当前发布 v1");
  await expect(panel.locator(".help-message")).toHaveCount(2);
  await page.getByRole("button", { name: "预览运行态" }).click();
  await expect(panel).toContainText("当前画面 v1");
  await panel.getByLabel("你的问题").fill("第二问");
  await panel.getByRole("button", { name: "发送", exact: true }).click();
  await expect(panel.locator(".help-message")).toHaveCount(4);
  expect(created).toBe(1);
  await expect(page.locator(".runtime-state")).toContainText("实时数据已连接");
  await panel.getByLabel("你的问题").fill("等待中的问题");
  await panel.getByRole("button", { name: "发送", exact: true }).click();
  await expect(panel).toContainText("正在查阅操作指南");
  expect((await request.post(`/api/pages/${pageId}/publish`)).ok()).toBe(true);
  await expect(panel).toContainText("当前 v1 对话仅供查看");
  await expect(panel.getByLabel("你的问题")).toBeDisabled();
  release();
  await expect(panel.locator(".help-message")).toHaveCount(5);
  await expect(panel.locator(".help-message--assistant")).toHaveCount(2);
  await page.screenshot({ path: "/tmp/industrial-runtime-help-frozen-formal.png" });
  await panel.getByRole("button", { name: "刷新运行画面" }).click();
  await expect(page.locator(".runtime-title")).toContainText("发布版本 · v2");
  await page.getByRole("button", { name: "使用帮助", exact: true }).click();
  await expect(panel.locator(".help-message")).toHaveCount(0);
  await expect(panel.getByLabel("你的问题")).toBeEnabled();
  await panel.getByLabel("你的问题").fill("新版问题");
  await panel.getByRole("button", { name: "发送", exact: true }).click();
  await expect(panel.locator(".help-message")).toHaveCount(2);
  expect(created).toBe(2);
  expect(questions).toBe(4);
  await page.screenshot({ path: "/tmp/industrial-runtime-help-formal.png" });
  expect(errors).toEqual([]);
});

test("WS 未通知时新版活动结果仍被拒绝，不替换旧快照", async ({ page, request }) => {
  const pageId = `runtime-version-race-${Date.now()}`;
  expect((await request.put(`/api/pages/${pageId}/draft`, { data: schema(pageId) })).ok()).toBe(true);
  const published = await (await request.post(`/api/pages/${pageId}/publish`)).json();
  // 只替代 WS，明确让版本通知缺席；HTTP 返回不同版本必须独立触发保护。
  await page.routeWebSocket(`**/ws/telemetry/pages/${pageId}?version=1`, socket => {
    socket.send(JSON.stringify({ type: "telemetry.snapshot", pageId, pageVersion: 1,
      publishedAt: published.publishedAt, serverTime: new Date().toISOString(), observations: {}, values: {} }));
  });
  let questions = 0;
  await page.route("**/api/help/**", async route => {
    const body = route.request().postDataJSON();
    if (route.request().url().endsWith("/sessions")) {
      await route.fulfill({ status: 201, json: { sessionId: "race-session" } });
      return;
    }
    const version = ++questions === 1 ? 1 : 2;
    const now = new Date().toISOString();
    await route.fulfill({ json: { requestId: body.requestId, answer: "活动资料", sources: [],
      active: { status: "ready", queryId: `q${questions}`, notice: "本次资料", data: {
        pageId, version, publishedAt: published.publishedAt, queriedAt: now, windowStart: published.publishedAt,
        staleAfterSeconds: 5, status: "ready", total: 1, omitted: 0,
        coverage: { configured: 1, observed: 1, missing: [], stale: [] },
        alarms: [{ id: `threshold:${pageId}.temperature:80`, kind: "threshold", title: "出口温度越界",
          deviceName: "验收泵", dataKey: `${pageId}.temperature`, threshold: 80, unit: "°C", precision: 1,
          freshness: "fresh", observation: { id: version === 1 ? 101 : 102, value: 83, receivedAt: now, sourceTimestamp: now } }],
      } } } });
  });
  await page.goto(`/runtime/${pageId}`);
  await page.getByRole("button", { name: "使用帮助", exact: true }).click();
  const panel = page.getByTestId("help-panel");
  await panel.getByRole("button", { name: /查询当前页面活动告警/ }).click();
  await expect(panel.getByRole("region", { name: "当前活动告警查询结果" })).toBeVisible();
  await panel.getByRole("button", { name: "重新查询", exact: true }).click();
  await expect(panel).toContainText("已拒绝显示该结果");
  await expect(panel).toContainText("当前画面 v1");
  await expect(panel.getByRole("button", { name: "重新查询", exact: true })).toBeDisabled();
  await expect(panel.locator(".help-message")).toHaveCount(2);
  await panel.getByText("查看来源依据", { exact: true }).click();
  await expect(panel).toContainText("观测 #101");
  await expect(panel).not.toContainText("观测 #102");
  expect(questions).toBe(2);
});

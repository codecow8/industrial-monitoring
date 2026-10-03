import { expect, test } from "@playwright/test";

test("历史告警加载失败可重试，滚动后继续加载", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const schema = {
    version: "1.0.0", id: "demo", name: "冷却系统监控",
    canvas: { width: 1440, height: 900, background: "#0e1d2b" },
    components: [
      { id: "metric", type: "metric-card", position: { x: 455, y: 250 }, size: { width: 300, height: 214 }, props: { deviceName: "1号冷却泵", title: "出口温度", dataKey: "pump1.outlet_temp", unit: "°C", precision: 1, alarmThreshold: 80 } },
      { id: "alarms", type: "alarm-list", position: { x: 20, y: 250 }, size: { width: 420, height: 260 }, props: { title: "活动告警" } },
    ],
  };
  const observedAt = new Date().toISOString();
  const observation = (id: number, value: number) => ({ id, value, receivedAt: observedAt, sourceTimestamp: observedAt });
  const record = (index: number) => ({
    id: `threshold:pump1.outlet_temp:${index}`, kind: "threshold", title: `出口温度越界 ${index}`,
    deviceName: "1号冷却泵", dataKey: "pump1.outlet_temp", threshold: 80, unit: "°C", precision: 1,
    triggeredAt: observedAt, recoveredAt: observedAt,
    trigger: { from: observation(index * 4 + 1, 72), to: observation(index * 4 + 2, 83) },
    recovery: { from: observation(index * 4 + 3, 83), to: observation(index * 4 + 4, 79) },
  });
  await page.route("**/api/pages/demo/published", route => route.fulfill({ json: { pageId: "demo", version: 1, publishedAt: observedAt, schema } }));
  await page.routeWebSocket("**/ws/telemetry/pages/demo?version=1", socket => {
    socket.onMessage(() => {});
    socket.send(JSON.stringify({ type: "telemetry.snapshot", pageId: "demo", pageVersion: 1, publishedAt: observedAt, serverTime: observedAt, observations: { "pump1.outlet_temp": { id: 103, value: 72, receivedAt: observedAt, sourceTimestamp: observedAt } }, values: { "pump1.outlet_temp": 72 } }));
  });
  let calls = 0;
  await page.route("**/api/pages/demo/alarm-history?**", async route => {
    calls += 1;
    if (calls === 1) {
      await route.fulfill({ status: 503, json: { detail: "查询暂不可用" } });
      return;
    }
    const offset = Number(new URL(route.request().url()).searchParams.get("offset"));
    const records = offset === 0 ? Array.from({ length: 20 }, (_, index) => record(index)) : [record(20)];
    await route.fulfill({ json: {
      pageId: "demo", version: 1, windowStart: observedAt, windowEnd: observedAt,
      total: 21, records, nextOffset: offset === 0 ? 20 : null,
    } });
  });

  await page.goto("/runtime/demo");
  await page.getByTestId("alarm-list").getByRole("button", { name: /历史/ }).click();
  const drawer = page.getByTestId("history-drawer");
  await expect(drawer).toContainText("查询暂不可用");
  await drawer.getByRole("button", { name: "重新加载" }).click();
  await expect(drawer.locator(".history-record")).toHaveCount(20);
  await drawer.locator(".history-scroll").evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(drawer.locator(".history-record")).toHaveCount(21);
  expect(calls).toBe(3);
  expect(errors).toEqual([]);
});

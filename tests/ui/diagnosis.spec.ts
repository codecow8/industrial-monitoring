import { expect, test } from "@playwright/test";

test("活动告警可打开分析、展示证据并在失败后重试", async ({ page }) => {
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
  await page.route("**/api/pages/demo/published", route => route.fulfill({ json: { pageId: "demo", version: 1, publishedAt: observedAt, schema } }));
  await page.routeWebSocket("**/ws/telemetry/pages/demo?version=1", socket => {
    socket.onMessage(() => {});
    socket.send(JSON.stringify({ type: "telemetry.snapshot", pageId: "demo", pageVersion: 1, publishedAt: observedAt, serverTime: observedAt, observations: { "pump1.outlet_temp": { id: 103, value: 83, receivedAt: observedAt, sourceTimestamp: observedAt } }, values: { "pump1.outlet_temp": 83 } }));
  });
  let calls = 0;
  let releaseFirst!: () => void;
  const firstCall = new Promise<void>(resolve => { releaseFirst = resolve; });
  await page.route("**/api/pages/demo/alarm-diagnoses", async route => {
    calls += 1;
    if (calls === 1) await firstCall;
    if (calls === 2) {
      await route.fulfill({ status: 503, json: { detail: "模型暂不可用" } });
      return;
    }
    await route.fulfill({ json: {
      status: "completed", alarm: { pageId: "demo", version: 1, condition: { kind: "threshold", dataKey: "pump1.outlet_temp", threshold: 80 } },
      observedFacts: [{ text: "温度观测为 83°C", sourceIds: ["observation:103"] }],
      possibleCauses: [{ text: "流量不足，待核实", sourceIds: ["manual:PUMP-01:3.2"] }],
      recommendedChecks: [{ text: "现场核对流量", sourceIds: ["manual:PUMP-01:3.2"] }],
      sources: [{ id: "observation:103", type: "observation", value: 83, receivedAt: new Date().toISOString() }, { id: "manual:PUMP-01:3.2", type: "manual", title: "PUMP-01 §3.2", excerpt: "核对流量和过滤器压差" }],
      dataFreshness: { windowStart: new Date().toISOString(), windowEnd: new Date().toISOString(), latestReceivedAt: new Date().toISOString(), stale: false },
    } });
  });

  await page.goto("/runtime/demo");
  await expect(page.getByTestId("alarm-list")).toContainText("活动告警");
  const analyze = page.getByRole("button", { name: "智能分析" });
  await expect(analyze).toBeVisible();
  await analyze.click();
  await expect(page.getByTestId("diagnosis-drawer")).toContainText("正在整理告警证据");
  releaseFirst();
  await expect(page.getByTestId("diagnosis-drawer")).toContainText("温度观测为 83°C");
  await expect(page.getByTestId("diagnosis-drawer")).toContainText("观测 #103");
  await page.getByRole("button", { name: "关闭智能分析" }).click();
  await analyze.click();
  await expect(page.getByTestId("diagnosis-drawer")).toContainText("模型暂不可用");
  await page.getByRole("button", { name: "重新分析" }).click();
  await expect(page.getByTestId("diagnosis-drawer")).toContainText("温度观测为 83°C");
  await page.screenshot({ path: "/tmp/industrial-diagnosis-drawer.png" });
  await expect(page.getByTestId("diagnosis-drawer")).toContainText("实时数据已过期", { timeout: 7000 });
  expect(errors).toEqual([]);
});

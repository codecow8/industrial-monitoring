import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

test.skip(process.env.LIVE_MODEL_EVAL !== "1", "显式设置 LIVE_MODEL_EVAL=1 才调用真实模型");

const browserErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", error => errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page)).toEqual([]);
});

const api = "http://127.0.0.1:8000/api";

test("固定冷却泵温度告警能生成有真实来源的只读分析", async ({ page, request }) => {
  const pageId = `diagnosis-live-${Date.now()}`;
  const temperatureKey = `${pageId}.outlet_temp`;
  const stateKey = `${pageId}.operating_state`;
  const schema = {
    version: "1.0.0", id: pageId, name: "冷却系统监控",
    canvas: { width: 1440, height: 900, background: "#0e1d2b" },
    components: [
      { id: "metric-pump-01", type: "metric-card", position: { x: 455, y: 250 }, size: { width: 300, height: 214 }, props: { deviceName: "1号冷却泵", title: "出口温度", dataKey: temperatureKey, unit: "°C", precision: 1, alarmThreshold: 80 } },
      { id: "state-pump-01", type: "device-state", position: { x: 795, y: 250 }, size: { width: 300, height: 180 }, props: { deviceName: "1号冷却泵", title: "运行状态", dataKey: stateKey } },
      { id: "alarm-list-main", type: "alarm-list", position: { x: 830, y: 470 }, size: { width: 520, height: 300 }, props: { title: "活动告警" } },
    ],
  };
  expect((await request.put(`${api}/pages/${pageId}/draft`, { data: schema })).status()).toBe(200);
  const published = await request.post(`${api}/pages/${pageId}/publish`);
  expect(published.status()).toBe(200);
  const publishedAt = (await published.json()).publishedAt as string;

  await page.goto(`/runtime/${pageId}`);
  await expect(page.getByTestId("alarm-list")).toContainText("等待设备数据");
  for (const values of [
    { [temperatureKey]: 72, [stateKey]: 1 },
    { [temperatureKey]: 78.5 },
    { [temperatureKey]: 83 },
    { [stateKey]: 2 },
  ]) {
    expect((await request.post(`${api}/telemetry`, { data: {
      timestamp: new Date().toISOString(), values,
    } })).status()).toBe(202);
  }
  await expect(page.getByTestId("alarm-list").locator(".alarm-row")).toHaveCount(2);

  const resultPromise = page.waitForResponse(response =>
    response.url().includes(`/pages/${pageId}/alarm-diagnoses`) && response.request().method() === "POST"
  );
  await page.getByTestId("alarm-list").locator(".alarm-row.threshold").getByRole("button", { name: "智能分析" }).click();
  const response = await resultPromise;
  const result = await response.json();
  expect(response.status(), JSON.stringify(result)).toBe(200);
  expect(result.status).toBe("completed");
  expect(result.alarm.condition).toEqual({ kind: "threshold", dataKey: temperatureKey, threshold: 80 });
  expect(result.observedFacts.length).toBeGreaterThan(0);
  expect(result.observedFacts.some((fact: { text: string }) => fact.text.includes("83"))).toBe(true);
  expect(result.observedFacts.every((fact: { text: string }) => !fact.text.includes("堵塞"))).toBe(true);
  expect(result.possibleCauses.every((cause: { text: string }) => cause.text.includes("待核实"))).toBe(true);
  expect(result.recommendedChecks.every((check: { text: string }) => !/远程|启动泵|停止泵|切换设备|修改设定值/.test(check.text))).toBe(true);

  const evidence = await request.get(`${api}/pages/${pageId}/alarm-evidence`, { params: {
    kind: "threshold", dataKey: temperatureKey, threshold: 80,
    start: publishedAt, end: new Date(Date.now() + 1000).toISOString(),
  } });
  expect(evidence.status()).toBe(200);
  const faultEvidence = await request.get(`${api}/pages/${pageId}/alarm-evidence`, { params: {
    kind: "fault", dataKey: stateKey,
    start: publishedAt, end: new Date(Date.now() + 1000).toISOString(),
  } });
  expect(faultEvidence.status()).toBe(200);
  const observedIds = new Set([
    ...(await evidence.json()).observations,
    ...(await faultEvidence.json()).observations,
  ].map((item: { id: number }) => `observation:${item.id}`));
  const sourceIds = new Set(result.sources.map((source: { id: string }) => source.id));
  for (const fact of result.observedFacts as { sourceIds: string[] }[]) {
    expect(fact.sourceIds.some(id => observedIds.has(id))).toBe(true);
    expect(fact.sourceIds.every(id => sourceIds.has(id))).toBe(true);
  }
  expect(result.sources.some((source: { type: string; dataKey?: string; value?: number }) =>
    source.type === "observation" && source.dataKey === stateKey && source.value === 2
  )).toBe(true);
  const drawer = page.getByTestId("diagnosis-drawer");
  await expect(drawer).toContainText("已整理可核对证据");
  await expect(drawer).toContainText("待核实");
  await page.screenshot({ path: "/tmp/industrial-diagnosis-live.png" });

  await drawer.getByRole("button", { name: "关闭智能分析" }).click();
  const faultPromise = page.waitForResponse(next =>
    next.url().includes(`/pages/${pageId}/alarm-diagnoses`) && next.request().method() === "POST"
  );
  await page.getByTestId("alarm-list").locator(".alarm-row.fault").getByRole("button", { name: "智能分析" }).click();
  const faultResponse = await faultPromise;
  const faultResult = await faultResponse.json();
  expect(faultResponse.status(), JSON.stringify(faultResult)).toBe(200);
  expect(faultResult.alarm.condition).toEqual({ kind: "fault", dataKey: stateKey, stateCode: 2 });
  expect(faultResult.observedFacts.some((fact: { sourceIds: string[] }) =>
    fact.sourceIds.some(id => observedIds.has(id))
  )).toBe(true);
  expect(faultResult.possibleCauses.every((cause: { text: string }) => cause.text.includes("待核实"))).toBe(true);
  expect(faultResult.recommendedChecks.every((check: { text: string }) => !/远程|启动泵|停止泵|切换设备|修改设定值/.test(check.text))).toBe(true);
  await expect(drawer).toContainText("已整理可核对证据");
  await page.screenshot({ path: "/tmp/industrial-fault-live.png" });

  await drawer.getByRole("button", { name: "关闭智能分析" }).click();
  expect((await request.post(`${api}/telemetry`, { data: {
    timestamp: new Date().toISOString(), values: { [temperatureKey]: 79, [stateKey]: 1 },
  } })).status()).toBe(202);
  await expect(page.getByTestId("alarm-list")).toContainText("当前无活动告警");
});

test("只有一条越界观测时明确显示证据不足", async ({ page, request }) => {
  const pageId = `diagnosis-limited-${Date.now()}`;
  const dataKey = `${pageId}.outlet_temp`;
  const schema = {
    version: "1.0.0", id: pageId, name: "冷却系统监控",
    canvas: { width: 1440, height: 900, background: "#0e1d2b" },
    components: [
      { id: "metric-pump-01", type: "metric-card", position: { x: 455, y: 250 }, size: { width: 300, height: 214 }, props: { deviceName: "1号冷却泵", title: "出口温度", dataKey, unit: "°C", precision: 1, alarmThreshold: 80 } },
      { id: "alarm-list-main", type: "alarm-list", position: { x: 830, y: 470 }, size: { width: 520, height: 300 }, props: { title: "活动告警" } },
    ],
  };
  expect((await request.put(`${api}/pages/${pageId}/draft`, { data: schema })).status()).toBe(200);
  expect((await request.post(`${api}/pages/${pageId}/publish`)).status()).toBe(200);
  await page.goto(`/runtime/${pageId}`);
  expect((await request.post(`${api}/telemetry`, { data: {
    timestamp: new Date().toISOString(), values: { [dataKey]: 83 },
  } })).status()).toBe(202);
  const row = page.getByTestId("alarm-list").locator(".alarm-row.threshold");
  await expect(row).toBeVisible();
  const resultPromise = page.waitForResponse(response =>
    response.url().includes(`/pages/${pageId}/alarm-diagnoses`) && response.request().method() === "POST"
  );
  await row.getByRole("button", { name: "智能分析" }).click();
  const response = await resultPromise;
  const result = await response.json();
  expect(response.status()).toBe(200);
  expect(result.status).toBe("insufficient_evidence");
  expect(result.possibleCauses).toEqual([]);
  expect(result.observedFacts[0].text).toContain("无法确认触发时间");
  await expect(page.getByTestId("diagnosis-drawer")).toContainText("证据不足");
  await page.screenshot({ path: "/tmp/industrial-insufficient-live.png" });
});

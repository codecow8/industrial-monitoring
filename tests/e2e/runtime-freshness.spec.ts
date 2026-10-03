import { expect, test } from "@playwright/test";

test("运行态保留旧版本，刷新后仅接受新版本发布之后的观测", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const pageId = `freshness-${Date.now()}`;
  const temperature = `${pageId}.temperature`;
  const state = `${pageId}.state`;
  const api = `http://127.0.0.1:8000/api/pages/${pageId}`;
  const schema = {
    version: "1.0.0", id: pageId, name: "新鲜度验收",
    canvas: { width: 1440, height: 900, background: "#0e1d2b" },
    components: [
      { id: "metric", type: "metric-card", position: { x: 455, y: 250 }, size: { width: 300, height: 214 }, props: { deviceName: "验收泵", title: "出口温度", dataKey: temperature, unit: "°C", precision: 1, alarmThreshold: 80 } },
      { id: "state", type: "device-state", position: { x: 780, y: 250 }, size: { width: 300, height: 214 }, props: { deviceName: "验收泵", title: "运行状态", dataKey: state } },
      { id: "alarms", type: "alarm-list", position: { x: 20, y: 250 }, size: { width: 420, height: 320 }, props: { title: "活动告警" } },
    ],
  };
  expect((await request.put(`${api}/draft`, { data: schema })).ok()).toBe(true);
  expect((await request.post(`${api}/publish`)).ok()).toBe(true);
  const post = async (values: Record<string, number>) => {
    // 故意使用错误设备时钟，确认新鲜度只依赖服务器接收时间。
    expect((await request.post("http://127.0.0.1:8000/api/telemetry", {
      data: { timestamp: "2000-01-01T00:00:00Z", values },
    })).status()).toBe(202);
  };
  await page.goto(`/runtime/${pageId}`);
  await expect(page).toHaveTitle("工业智控平台");
  const alarms = page.getByTestId("alarm-list");
  await expect(alarms).toContainText("等待设备数据");
  await post({ [temperature]: 72 });
  await expect(alarms).toContainText("资料不足，无法确认当前告警");
  await expect(alarms).toContainText("1 项缺少观测");
  await post({ [state]: 1 });
  await expect(alarms).toContainText("本次观测未触发已配置条件");
  await expect(alarms).toContainText("观测已过期", { timeout: 7000 });
  // 页面重新订阅数据库旧快照，也不能把正常旧值当成新鲜。
  await page.reload();
  await expect(alarms).toContainText("资料不足，无法确认当前告警");
  await post({ [temperature]: 83, [state]: 2 });
  await expect(alarms.locator(".alarm-row")).toHaveCount(2);
  await expect(alarms).toContainText("数据已过期", { timeout: 7000 });
  const active = await (await request.get(`${api}/active-alarms`)).json();
  expect(active.status).toBe("stale");
  expect(active.total).toBe(2);
  await page.reload();
  await expect(alarms.locator(".alarm-row.stale")).toHaveCount(2);

  schema.name = "新版新鲜度验收";
  expect((await request.put(`${api}/draft`, { data: schema })).ok()).toBe(true);
  expect((await request.post(`${api}/publish`)).ok()).toBe(true);
  await expect(page.getByRole("alert")).toContainText("当前 v1 仅供查看");
  await expect(page.locator(".runtime-title")).toContainText("新鲜度验收");
  await expect(alarms.getByRole("button", { name: /历史/ })).toBeDisabled();
  await expect(alarms.getByRole("button", { name: /智能分析/ }).first()).toBeDisabled();
  await post({ [temperature]: 72, [state]: 1 });
  await expect(alarms.locator(".alarm-row.stale")).toHaveCount(2);
  await page.screenshot({ path: "/tmp/industrial-runtime-version-formal.png" });

  // 第三版发布后尚无新观测，刷新应清除第二版资料并进入等待状态。
  expect((await request.post(`${api}/publish`)).ok()).toBe(true);
  await page.getByRole("button", { name: "刷新到最新发布版本" }).click();
  await expect(page.locator(".runtime-title")).toContainText("发布版本 · v3");
  await expect(alarms).toContainText("等待设备数据");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await post({ [temperature]: 72, [state]: 1 });
  await expect(alarms).toContainText("本次观测未触发已配置条件");
  await page.screenshot({ path: "/tmp/industrial-runtime-fresh-formal.png" });
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  expect(errors).toEqual([]);
});

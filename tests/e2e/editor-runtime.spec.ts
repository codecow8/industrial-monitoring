import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const browserErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page)).toEqual([]);
});

test("编辑属性后发布并通过同一 Schema 进入运行态", async ({ page }) => {
  const pageId = `browser-draft-${Date.now()}`;
  await page.goto(`/editor/${pageId}`);
  await expect(page.locator('main[aria-busy="false"]')).toBeVisible();
  await page.getByLabel("指标标题").fill("轴承温度");

  await expect(page.getByTestId("metric-card")).toContainText("轴承温度");
  await expect(page.getByTestId("schema-preview")).toContainText("轴承温度");

  await page.getByRole("button", { name: "保存草稿" }).click();
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByLabel("指标标题")).toHaveValue("轴承温度");
  await page.getByRole("button", { name: "发布版本" }).click();
  await page.getByRole("button", { name: "预览运行态" }).click();

  await expect(page).toHaveURL(new RegExp(`/runtime/${pageId}$`));
  await expect(page.getByTestId("metric-card")).toContainText("轴承温度");
  await expect(page.getByText("属性配置")).toHaveCount(0);
});

test("拖动和缩放会更新 PageSchema 几何信息", async ({ page }) => {
  await page.goto("/editor/demo");
  await expect(page.locator('main[aria-busy="false"]')).toBeVisible();
  const card = page.getByTestId("metric-card");
  const initialBox = await card.boundingBox();
  if (!initialBox) throw new Error("指标卡没有可见边界");

  await page.mouse.move(initialBox.x + initialBox.width / 2, initialBox.y + 28);
  await page.mouse.down();
  await page.mouse.move(initialBox.x + initialBox.width / 2 - 40, initialBox.y - 12);
  await page.mouse.up();

  const moved = JSON.parse(await page.getByTestId("schema-preview").innerText());
  expect(moved.components[0].position).not.toEqual({ x: 455, y: 250 });

  const resizeHandle = page.locator(".moveable-control.moveable-se");
  const handleBox = await resizeHandle.boundingBox();
  if (!handleBox) throw new Error("缩放控制点不可见");
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 50, handleBox.y + 30, { steps: 10 });
  await page.mouse.up();

  await expect.poll(async () => {
    const resized = JSON.parse(await page.getByTestId("schema-preview").innerText());
    return resized.components[0].size.width;
  }).toBeGreaterThan(300);
  await expect.poll(async () => {
    const resized = JSON.parse(await page.getByTestId("schema-preview").innerText());
    return resized.components[0].size.height;
  }).toBeGreaterThan(214);
});

test("合法 Schema 可以导入并导出为 JSON 文件", async ({ page }) => {
  await page.goto("/editor/import-demo");
  await expect(page.locator('main[aria-busy="false"]')).toBeVisible();
  const imported = JSON.parse(await page.getByTestId("schema-preview").innerText());
  imported.components[0].props.title = "导入后的温度";

  await page.getByRole("button", { name: "导入" }).click();
  await page.getByRole("dialog").getByRole("textbox").fill(JSON.stringify(imported, null, 2));
  await page.getByRole("button", { name: "校验并导入" }).click();
  await expect(page.getByTestId("metric-card")).toContainText("导入后的温度");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("import-demo.schema.json");
});

test("运行态保持已发布版本直到再次发布", async ({ page }) => {
  const pageId = `publish-browser-${Date.now()}`;
  await page.goto(`/editor/${pageId}`);
  await expect(page.locator('main[aria-busy="false"]')).toBeVisible();

  await page.getByLabel("指标标题").fill("出口温度 A");
  await page.getByRole("button", { name: "发布版本" }).click();
  await page.getByRole("button", { name: "预览运行态" }).click();
  await expect(page.getByTestId("metric-card")).toContainText("出口温度 A");

  await page.getByRole("button", { name: "返回编辑器" }).click();
  await expect(page.locator('main[aria-busy="false"]')).toBeVisible();
  await page.getByLabel("指标标题").fill("轴承温度 B");
  await page.getByRole("button", { name: "保存草稿" }).click();
  await page.getByRole("button", { name: "预览运行态" }).click();
  await expect(page.getByTestId("metric-card")).toContainText("出口温度 A");

  await page.getByRole("button", { name: "返回编辑器" }).click();
  await expect(page.locator('main[aria-busy="false"]')).toBeVisible();
  await page.getByRole("button", { name: "发布版本" }).click();
  await page.getByRole("button", { name: "预览运行态" }).click();
  await expect(page.getByTestId("metric-card")).toContainText("轴承温度 B");
});

test("运行态从等待数据到正常、告警和过期", async ({ page, request }) => {
  const pageId = `telemetry-browser-${Date.now()}`;
  const dataKey = `pump-${Date.now()}.outlet_temp`;
  await page.goto(`/editor/${pageId}`);
  await expect(page.locator('main[aria-busy="false"]')).toBeVisible();
  await page.getByLabel("数据键").fill(dataKey);
  await page.getByRole("button", { name: "发布版本" }).click();
  await page.getByRole("button", { name: "预览运行态" }).click();

  const card = page.getByTestId("metric-card");
  await expect(card).toContainText("等待设备数据");
  await expect(card.locator(".metric-card__value")).toHaveText("--");

  await request.post("http://127.0.0.1:8000/api/telemetry", {
    data: {
      timestamp: "2026-09-15T10:00:00Z",
      values: { [dataKey]: 68.4 },
    },
  });
  await expect(card).toContainText("运行正常");
  await expect(card.locator(".metric-card__value")).toHaveText("68.4");

  await request.post("http://127.0.0.1:8000/api/telemetry", {
    data: {
      timestamp: "2026-09-15T10:00:01Z",
      values: { [dataKey]: 83.0 },
    },
  });
  await expect(card).toContainText("温度告警");
  await expect(card.locator(".metric-card__value")).toHaveText("83.0");

  await expect(card).toContainText("数据已过期", { timeout: 6000 });
});

test("添加并发布实时趋势图", async ({ page }) => {
  const pageId = `trend-browser-${Date.now()}`;
  await page.goto(`/editor/${pageId}`);
  await expect(page.locator('main[aria-busy="false"]')).toBeVisible();

  await page.getByRole("button", { name: "折线图" }).click();
  const chart = page.getByTestId("trend-chart");
  await expect(chart).toBeVisible();
  await expect(page.getByTestId("schema-preview")).toContainText('"type": "trend-chart"');

  await page.getByLabel("图表标题").fill("冷却泵温度趋势");
  await page.getByRole("button", { name: "发布版本" }).click();
  await page.getByRole("button", { name: "预览运行态" }).click();

  await expect(page.getByTestId("trend-chart")).toContainText("冷却泵温度趋势");
  await expect(page.getByTestId("trend-chart")).toContainText("等待设备数据");
});

test("趋势图显示实时值、阈值告警和数据过期", async ({ page, request }) => {
  const pageId = `trend-telemetry-${Date.now()}`;
  const dataKey = `trend-${Date.now()}.outlet_temp`;
  await page.goto(`/editor/${pageId}`);
  await expect(page.locator('main[aria-busy="false"]')).toBeVisible();
  await page.getByRole("button", { name: "折线图" }).click();
  await page.getByLabel("数据键").fill(dataKey);
  await page.getByRole("button", { name: "发布版本" }).click();
  await page.getByRole("button", { name: "预览运行态" }).click();

  const chart = page.getByTestId("trend-chart");
  await expect(chart).toContainText("等待设备数据");

  await request.post("http://127.0.0.1:8000/api/telemetry", {
    data: {
      timestamp: "2026-09-17T10:00:00Z",
      values: { [dataKey]: 68.4 },
    },
  });
  await expect(chart.getByTestId("trend-current-value")).toHaveText("68.4");
  await expect(chart).toContainText("数据新鲜");

  await request.post("http://127.0.0.1:8000/api/telemetry", {
    data: {
      timestamp: "2026-09-17T10:00:01Z",
      values: { [dataKey]: 83.0 },
    },
  });
  await expect(chart.getByTestId("trend-current-value")).toHaveText("83.0");
  await expect(chart).toContainText("超过告警阈值");
  await expect(chart).toContainText("数据已过期", { timeout: 6000 });

  await request.post("http://127.0.0.1:8000/api/telemetry", {
    data: {
      timestamp: "2026-09-17T10:00:07Z",
      values: { [dataKey]: 74.0 },
    },
  });
  await expect(chart).toContainText("数据新鲜");
  await expect(chart).toHaveAttribute("aria-label", /数据缺口 1 处/);
});

test("右键菜单可删除组件并通过撤销恢复", async ({ page }) => {
  const pageId = `context-menu-${Date.now()}`;
  await page.goto(`/editor/${pageId}`);
  await expect(page.locator('main[aria-busy="false"]')).toBeVisible();

  const card = page.getByTestId("metric-card");
  await card.click({ button: "right" });
  const menu = page.getByRole("menu", { name: "组件操作" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "删除", exact: true }).click();

  await expect(card).toHaveCount(0);
  await expect(page.getByTestId("schema-preview")).toContainText('"components": []');

  await page.getByRole("button", { name: "撤销" }).click();
  await expect(page.getByTestId("metric-card")).toBeVisible();
});

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
  const pageId = `geometry-browser-${Date.now()}`;
  await page.goto(`/editor/${pageId}`);
  await expect(page.locator('main[aria-busy="false"]')).toBeVisible();
  const initial = JSON.parse(await page.getByTestId("schema-preview").innerText());
  const initialNode = initial.components[0];
  const card = page.getByTestId("metric-card");
  const initialBox = await card.boundingBox();
  if (!initialBox) throw new Error("指标卡没有可见边界");

  await page.mouse.move(initialBox.x + initialBox.width / 2, initialBox.y + 28);
  await page.mouse.down();
  await page.mouse.move(initialBox.x + initialBox.width / 2 - 40, initialBox.y - 12);
  await page.mouse.up();

  await expect.poll(async () => {
    const moved = JSON.parse(await page.getByTestId("schema-preview").innerText());
    return moved.components[0].position;
  }).not.toEqual(initialNode.position);

  const resizeHandle = page.locator(".moveable-control.moveable-se");
  await expect(resizeHandle).toBeVisible();
  const handleBox = await resizeHandle.boundingBox();
  if (!handleBox) throw new Error("缩放控制点不可见");
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 50, handleBox.y + 30, { steps: 10 });
  await page.mouse.up();

  await expect.poll(async () => {
    const resized = JSON.parse(await page.getByTestId("schema-preview").innerText());
    return resized.components[0].size.width;
  }).toBeGreaterThan(initialNode.size.width);
  await expect.poll(async () => {
    const resized = JSON.parse(await page.getByTestId("schema-preview").innerText());
    return resized.components[0].size.height;
  }).toBeGreaterThan(initialNode.size.height);
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

test("添加并发布设备状态组件后显示实时状态和数据过期", async ({ page, request }) => {
  const pageId = `device-state-${Date.now()}`;
  const dataKey = `pump-${Date.now()}.operating_state`;
  await page.goto(`/editor/${pageId}`);
  await expect(page.locator('main[aria-busy="false"]')).toBeVisible();

  await page.getByRole("button", { name: "设备状态" }).click();
  await page.getByRole("button", { name: "设备状态" }).click();
  await expect(page.getByTestId("device-state")).toHaveCount(1);
  await page.getByLabel("设备名称").fill("2号冷却泵");
  await page.getByLabel("组件标题").fill("生产状态");
  await page.getByLabel("数据键").fill(dataKey);
  await page.getByRole("button", { name: "发布版本" }).click();
  await page.getByRole("button", { name: "预览运行态" }).click();

  const state = page.getByTestId("device-state");
  await expect(state).toContainText("2号冷却泵");
  await expect(state).toContainText("生产状态");
  await expect(state).toContainText("等待设备状态");

  await request.post("http://127.0.0.1:8000/api/telemetry", {
    data: {
      timestamp: "2026-09-18T10:00:00Z",
      values: { [dataKey]: 1 },
    },
  });
  await expect(state).toContainText("运行");

  await request.post("http://127.0.0.1:8000/api/telemetry", {
    data: {
      timestamp: "2026-09-18T10:00:01Z",
      values: { [dataKey]: 2 },
    },
  });
  await expect(state).toContainText("故障");

  await request.post("http://127.0.0.1:8000/api/telemetry", {
    data: {
      timestamp: "2026-09-18T10:00:02Z",
      values: { [dataKey]: 9 },
    },
  });
  await expect(state).toContainText("未知状态 · 状态码 9");
  await expect(state).toContainText("状态数据已过期", { timeout: 6000 });
});

test("添加并发布告警列表后聚合活动告警并在恢复后清空", async ({ page, request }) => {
  const pageId = `alarm-list-${Date.now()}`;
  const temperatureKey = `pump-${Date.now()}.outlet_temp`;
  const stateKey = `pump-${Date.now()}.operating_state`;
  await page.goto(`/editor/${pageId}`);
  await expect(page.locator('main[aria-busy="false"]')).toBeVisible();

  await page.getByLabel("数据键").fill(temperatureKey);
  await page.getByRole("button", { name: "折线图" }).click();
  await page.getByLabel("数据键").fill(temperatureKey);
  await page.getByRole("button", { name: "设备状态" }).click();
  await page.getByLabel("数据键").fill(stateKey);
  await page.getByRole("button", { name: "告警列表" }).click();
  await page.getByRole("button", { name: "告警列表" }).click();

  await expect(page.getByTestId("alarm-list")).toHaveCount(1);
  await page.getByLabel("组件标题").fill("当前活动告警");
  await page.getByRole("button", { name: "发布版本" }).click();
  await expect(page.getByRole("button", { name: "发布版本" })).toBeEnabled();
  await page.getByRole("button", { name: "预览运行态" }).click();
  await expect(page).toHaveURL(new RegExp(`/runtime/${pageId}$`));

  const alarmList = page.getByTestId("alarm-list");
  await expect(alarmList).toContainText("当前活动告警");
  await expect(alarmList).toContainText("等待设备数据");

  await request.post("http://127.0.0.1:8000/api/telemetry", {
    data: {
      timestamp: "2026-09-22T10:00:00Z",
      values: { [temperatureKey]: 83, [stateKey]: 2 },
    },
  });
  await expect(alarmList).toContainText("2 条");
  const rows = alarmList.locator(".alarm-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("设备故障");
  await expect(rows.nth(1)).toContainText("出口温度超过告警阈值");

  await expect(rows.nth(0)).toContainText("数据已过期", { timeout: 6000 });
  await expect(rows.nth(1)).toContainText("数据已过期");

  await request.post("http://127.0.0.1:8000/api/telemetry", {
    data: {
      timestamp: "2026-09-22T10:00:06Z",
      values: { [temperatureKey]: 68.4, [stateKey]: 1 },
    },
  });
  await expect(alarmList).toContainText("当前无活动告警");
  await expect(rows).toHaveCount(0);
});

test("运行态可查看由真实观测证明的历史告警", async ({ page, request }) => {
  const pageId = `history-browser-${Date.now()}`;
  const dataKey = `pump-${Date.now()}.outlet_temp`;
  await page.goto(`/editor/${pageId}`);
  await expect(page.locator('main[aria-busy="false"]')).toBeVisible();
  await page.getByLabel("数据键").fill(dataKey);
  await page.getByRole("button", { name: "告警列表" }).click();
  await page.getByRole("button", { name: "发布版本" }).click();
  await page.getByRole("button", { name: "预览运行态" }).click();

  const historyButton = page.getByTestId("alarm-list").getByRole("button", { name: /历史/ });
  await expect(page.getByTestId("alarm-list")).toContainText("0 条");
  await historyButton.click();
  const drawer = page.getByTestId("history-drawer");
  await expect(drawer).toContainText("暂无历史告警");
  await drawer.getByRole("button", { name: "关闭历史告警" }).click();

  for (const value of [72, 83, 79]) {
    const sent = await request.post("http://127.0.0.1:8000/api/telemetry", {
      data: { timestamp: "2026-09-27T10:00:00Z", values: { [dataKey]: value } },
    });
    expect(sent.status()).toBe(202);
  }
  await expect(page.getByTestId("alarm-list")).toContainText("当前无活动告警");
  await historyButton.click();
  await expect(drawer).toContainText("出口温度越界");
  await expect(drawer).toContainText("已恢复");
  await drawer.getByText("查看观测依据").click();
  await expect(drawer).toContainText("触发：#");
  await page.screenshot({ path: "/tmp/industrial-history-real.png" });
});

test("纯文本组件可编辑、调整几何信息并随发布版本进入运行态", async ({ page }) => {
  const pageId = `text-browser-${Date.now()}`;
  await page.goto(`/editor/${pageId}`);
  await expect(page.locator('main[aria-busy="false"]')).toBeVisible();
  await page.getByRole("button", { name: "文本" }).click();

  const block = page.getByTestId("text-block");
  await expect(block).toHaveCount(1);
  await page.getByRole("textbox", { name: "文本内容" }).fill("冷却泵监控\n请核对现场设备状态");
  await page.getByRole("spinbutton", { name: "字号" }).fill("28");
  await page.getByRole("spinbutton", { name: "字号" }).press("Tab");
  await page.getByLabel("文字颜色").fill("#8bd4e5");
  await page.getByRole("combobox", { name: "对齐方式" }).selectOption("center");
  await expect(block).toContainText("请核对现场设备状态");
  await expect(block).toHaveCSS("font-size", "28px");
  await expect(block).toHaveCSS("text-align", "center");

  const before = JSON.parse(await page.getByTestId("schema-preview").innerText());
  const original = before.components.find((node: { type: string }) => node.type === "text-block");
  await page.getByRole("region", { name: "编辑画布" }).evaluate((canvas) => { canvas.scrollLeft = 180; });
  const box = await block.boundingBox();
  if (!box) throw new Error("文本组件没有可见边界");
  await page.mouse.move(box.x + 40, box.y + 25);
  await page.mouse.down();
  await page.mouse.move(box.x + 70, box.y + 25);
  await page.mouse.up();
  await expect.poll(async () => {
    const schema = JSON.parse(await page.getByTestId("schema-preview").innerText());
    return schema.components.find((node: { type: string }) => node.type === "text-block").position.x;
  }).toBeGreaterThan(original.position.x);

  const handle = page.locator(".moveable-control.moveable-se");
  await expect(handle).toBeVisible();
  await expect.poll(async () => {
    const targetBox = await page.locator(`[data-component-id="${original.id}"]`).boundingBox();
    const currentHandle = await handle.boundingBox();
    if (!targetBox || !currentHandle) return Infinity;
    return Math.max(
      Math.abs(currentHandle.x + currentHandle.width / 2 - targetBox.x - targetBox.width),
      Math.abs(currentHandle.y + currentHandle.height / 2 - targetBox.y - targetBox.height),
    );
  }).toBeLessThan(5);
  const handleBox = await handle.boundingBox();
  if (!handleBox) throw new Error("文本组件没有缩放手柄");
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 30, handleBox.y + handleBox.height / 2 + 20, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => {
    const schema = JSON.parse(await page.getByTestId("schema-preview").innerText());
    return schema.components.find((node: { type: string }) => node.type === "text-block").size.width;
  }).toBeGreaterThan(original.size.width);

  const savedPromise = page.waitForResponse(response =>
    response.url().endsWith(`/api/pages/${pageId}/draft`) && response.request().method() === "PUT"
  );
  await page.getByRole("button", { name: "保存草稿" }).click();
  const saved = await savedPromise;
  expect(saved.status(), await saved.text()).toBe(200);
  await page.reload();
  await expect(page.getByTestId("text-block")).toContainText("请核对现场设备状态");
  await page.getByRole("button", { name: "发布版本" }).click();
  await page.getByRole("button", { name: "预览运行态" }).click();
  await expect(page.getByTestId("text-block")).toContainText("冷却泵监控");
  await expect(page.getByTestId("text-block")).toHaveCSS("color", "rgb(139, 212, 229)");
  await expect(page.getByText("属性配置")).toHaveCount(0);
  await page.screenshot({ path: "/tmp/industrial-text-runtime.png" });
});

test("同一画布可以添加多个独立文本组件", async ({ page }) => {
  await page.goto(`/editor/text-multiple-${Date.now()}`);
  await expect(page.locator('main[aria-busy="false"]')).toBeVisible();
  await page.getByRole("button", { name: "文本" }).click();
  await page.getByRole("button", { name: "文本" }).click();

  await expect(page.getByTestId("text-block")).toHaveCount(2);
  const schema = JSON.parse(await page.getByTestId("schema-preview").innerText());
  const ids = schema.components.filter((node: { type: string }) => node.type === "text-block").map((node: { id: string }) => node.id);
  expect(new Set(ids).size).toBe(2);
});

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createAlarmHistoryTool } from "../../services/agent/src/alarm-history-tool.ts";

// 显式运行才消耗模型额度和写入短期测试遥测；每次使用独立页面及数据键。
test.skip(process.env.LIVE_HELP_HISTORY_EVAL !== "1", "显式设置 LIVE_HELP_HISTORY_EVAL=1 才调用真实模型");
test.setTimeout(150_000);

const api = "http://127.0.0.1:8000/api";
type Observation = { id: number; value: number; receivedAt: string };
type Record = { id: string; trigger: { from: Observation; to: Observation }; recovery: { from: Observation; to: Observation } };
type History = { status: string; queryId: string; data: { pageId: string; version: number; windowStart: string; windowEnd: string; total: number; nextOffset: number | null; records: Record[] } };

test("帮助侧栏用真实模型查询21条已恢复历史并继续下一批", async ({ page, request }) => {
  const suffix = randomUUID();
  const pageId = `help-pagination-${suffix}`;
  const dataKey = `${pageId}.outlet_temp`;
  const schema = JSON.parse(await readFile("fixtures/valid-page-schema.json", "utf8"));
  schema.id = pageId;
  schema.components[0].props.dataKey = dataKey;
  expect((await request.put(`${api}/pages/${pageId}/draft`, { data: schema })).status()).toBe(200);
  expect((await request.post(`${api}/pages/${pageId}/publish`)).status()).toBe(200);

  // 72 是前态；每组 83 → 79 都有明确触发与恢复观测。
  for (const value of [72, ...Array.from({ length: 21 }, () => [83, 79]).flat()]) {
    const sent = await request.post(`${api}/telemetry`, {
      data: { timestamp: new Date().toISOString(), values: { [dataKey]: value } },
    });
    expect(sent.status()).toBe(202);
  }

  const expectedResponse = await request.get(`${api}/pages/${pageId}/alarm-history`, { params: { limit: 20 } });
  expect(expectedResponse.status()).toBe(200);
  const expected = await expectedResponse.json() as History["data"];
  expect(expected.total).toBe(21);
  expect(expected.records).toHaveLength(20);
  expect(expected.nextOffset).toBe(20);
  const expectedLastResponse = await request.get(`${api}/pages/${pageId}/alarm-history`, {
    params: { limit: 20, offset: 20, asOf: expected.windowEnd },
  });
  expect(expectedLastResponse.status()).toBe(200);
  const expectedLast = await expectedLastResponse.json() as History["data"];
  expect(expectedLast.records).toHaveLength(1);

  await page.goto(`/editor/${pageId}`);
  await expect(page.locator('main[aria-busy="false"]')).toBeVisible();
  await page.getByRole("button", { name: "使用帮助" }).click();
  const panel = page.getByTestId("help-panel");
  const questionResponse = () => page.waitForResponse((response) =>
    /\/api\/help\/sessions\/[^/]+\/questions$/.test(response.url()) && response.request().method() === "POST");

  const firstPending = questionResponse();
  await panel.getByRole("button", { name: /查询当前页面历史告警/ }).click();
  const firstResponse = await firstPending;
  const firstBody = await firstResponse.json();
  expect(firstResponse.status(), JSON.stringify(firstBody)).toBe(200);
  const first = firstBody.history as History;
  expect(first.status).toBe("ready");
  expect(first.data.pageId).toBe(pageId);
  expect(first.data.total).toBe(21);
  expect(first.data.records).toHaveLength(20);
  expect(first.data.nextOffset).toBe(20);
  expect(firstBody.sources.filter((source: { source: string }) => source.source.startsWith("history-record:"))).toHaveLength(20);
  const view = panel.locator(".help-history-result");
  await expect(view.locator(".help-alarm-record")).toHaveCount(20);

  const nextPending = questionResponse();
  await view.getByRole("button", { name: "继续查看" }).click();
  const nextResponse = await nextPending;
  const nextBody = await nextResponse.json();
  expect(nextResponse.status(), JSON.stringify(nextBody)).toBe(200);
  expect(nextResponse.request().postDataJSON().historyCommand).toEqual({ action: "next", queryId: first.queryId });
  const next = nextBody.history as History;
  expect(next.status).toBe("ready");
  expect(next.queryId).toBe(first.queryId);
  expect(next.data.windowStart).toBe(first.data.windowStart);
  expect(next.data.windowEnd).toBe(first.data.windowEnd);
  expect(next.data.total).toBe(21);
  expect(next.data.records).toHaveLength(1);
  expect(next.data.nextOffset).toBeNull();
  const ids = [...first.data.records, ...next.data.records].map((record) => record.id);
  expect(new Set(ids).size).toBe(21);
  expect(ids).toEqual([...expected.records, ...expectedLast.records].map((record) => record.id));
  await expect(view.locator(".help-alarm-record")).toHaveCount(21);
  await expect(view).toContainText("已显示 21 / 21");

  // 展开首尾两条，核对界面所展示的来源 ID 和观测 ID。
  for (const [index, record] of [[0, first.data.records[0]], [20, next.data.records[0]]] as const) {
    const row = view.locator(".help-alarm-record").nth(index);
    await row.getByText("查看观测依据").click();
    await expect(row).toContainText(record.id);
    await expect(row).toContainText(`观测 #${record.trigger.to.id}`);
    await expect(row).toContainText(`#${record.recovery.to.id}（`);
  }
  await page.screenshot({ path: "/tmp/industrial-help-history-pagination.png" });
});

test("真实业务 API 发布版本变化后拒绝继续旧历史分页", async ({ request }) => {
  const pageId = `help-version-${randomUUID()}`;
  const dataKey = `${pageId}.outlet_temp`;
  const schema = JSON.parse(await readFile("fixtures/valid-page-schema.json", "utf8"));
  schema.id = pageId;
  schema.components[0].props.dataKey = dataKey;
  expect((await request.put(`${api}/pages/${pageId}/draft`, { data: schema })).status()).toBe(200);
  expect((await request.post(`${api}/pages/${pageId}/publish`)).status()).toBe(200);
  for (const value of [72, ...Array.from({ length: 21 }, () => [83, 79]).flat()]) {
    expect((await request.post(`${api}/telemetry`, {
      data: { timestamp: new Date().toISOString(), values: { [dataKey]: value } },
    })).status()).toBe(202);
  }

  const tool = createAlarmHistoryTool(pageId);
  const first = (await tool.execute("before-publish", { action: "start" })).details;
  expect(first.status).toBe("ready");
  expect(first.data?.nextOffset).toBe(20);

  // 旧截止时间早于新发布时间；工具不能把 v2 的记录接到 v1 的首批后面。
  await expect((await request.post(`${api}/pages/${pageId}/publish`)).json()).resolves.toMatchObject({ version: 2 });
  const next = (await tool.execute("after-publish", { action: "next" })).details;
  expect(next.status).toBe("version_changed");
  expect(next.data).toBeUndefined();
  expect((await tool.execute("again", { action: "next" })).details.status).toBe("error");
});

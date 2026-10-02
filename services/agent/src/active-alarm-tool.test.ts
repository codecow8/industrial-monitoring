import assert from "node:assert/strict";
import { test } from "node:test";
import { Value } from "typebox/value";
import { createActiveAlarmTool } from "./active-alarm-tool.ts";
import { ActiveAlarmError, validateActiveAlarms, type ActiveAlarmSnapshot } from "./active-alarms.ts";

function fixture(): ActiveAlarmSnapshot {
  const observation = { id: 101, value: 83, receivedAt: "2026-10-02T10:00:00Z", sourceTimestamp: "device-time" };
  return {
    pageId: "demo", version: 1, publishedAt: "2026-10-02T09:00:00Z",
    queriedAt: "2026-10-02T10:00:01Z", windowStart: "2026-10-02T09:00:00Z", staleAfterSeconds: 5,
    status: "ready" as const, coverage: { configured: 1, observed: 1, missing: [] as string[], stale: [] as { dataKey: string; observation: typeof observation }[] },
    total: 1, omitted: 0,
    alarms: [{ id: "threshold:pump.temp:80", kind: "threshold" as const, title: "出口温度越界", deviceName: "泵",
      dataKey: "pump.temp", threshold: 80, unit: "°C", precision: 1, freshness: "fresh" as const, observation }],
  };
}

test("活动工具只查询绑定页面，返回真实观测及唯一查询编号", async () => {
  const calls: string[] = [];
  const tool = createActiveAlarmTool("demo", async (pageId) => { calls.push(pageId); return fixture(); });
  const first = (await tool.execute("first", {})).details;
  const second = (await tool.execute("refresh", {})).details;
  assert.deepEqual(calls, ["demo", "demo"]);
  assert.equal(first.status, "ready");
  assert.deepEqual(first.data?.alarms[0].observation, fixture().alarms[0].observation);
  assert.notEqual(first.queryId, second.queryId);
  for (const params of [{ pageId: "other" }, { url: "https://example.com" }, { limit: 100 }, { asOf: "yesterday" }]) {
    assert.equal(Value.Check(tool.parameters, params), false);
  }
});

test("缺数和过期明确保留不完整状态，不能被解释成正常", async () => {
  const partial = fixture();
  partial.status = "partial";
  partial.coverage.configured = 2;
  partial.coverage.missing = ["pump.state"];
  const partialResult = (await createActiveAlarmTool("demo", async () => partial).execute("one", {})).details;
  assert.equal(partialResult.status, "partial");
  assert.ok(partialResult.notice.includes("不能宣称一切正常"));

  const stale = fixture();
  stale.queriedAt = "2026-10-02T10:00:06Z";
  stale.status = "stale";
  stale.alarms[0].freshness = "stale";
  stale.coverage.stale = [{ dataKey: "pump.temp", observation: stale.alarms[0].observation }];
  const result = await createActiveAlarmTool("demo", async () => stale).execute("two", {});
  assert.equal(result.details.data?.total, 1);
  assert.ok(result.details.notice.includes("当前状态需核实"));
  assert.deepEqual(JSON.parse(result.content[0].text), result.details);

  const empty = fixture();
  empty.status = "no_data";
  empty.coverage.observed = 0;
  empty.coverage.missing = ["pump.temp"];
  empty.total = 0; empty.alarms = [];
  const missing = (await createActiveAlarmTool("demo", async () => empty).execute("three", {})).details;
  assert.equal(missing.status, "no_data");
  assert.ok(missing.notice.includes("不能判断"));
});

test("拒绝页面、计数、时间或触发依据不一致的响应", () => {
  const wrongPage = fixture(); wrongPage.pageId = "other";
  const wrongCount = fixture(); wrongCount.total = 21;
  const wrongCoverage = fixture(); wrongCoverage.coverage.configured = 2;
  const notTriggered = fixture(); notTriggered.alarms[0].observation.value = 72;
  const beforePublish = fixture(); beforePublish.alarms[0].observation.receivedAt = "2026-10-02T08:00:00Z";
  const inFuture = fixture(); inFuture.alarms[0].observation.receivedAt = "2026-10-02T10:00:02Z";
  for (const data of [wrongPage, wrongCount, wrongCoverage, notTriggered, beforePublish, inFuture, {}]) {
    assert.throws(() => validateActiveAlarms(data, "demo"));
  }
});

test("未发布与查询失败分开表达，失败不泄露内部错误", async () => {
  const unpublished = createActiveAlarmTool("demo", async () => { throw new ActiveAlarmError("NOT_PUBLISHED", "当前页面尚未发布，请先手动发布。"); });
  assert.equal((await unpublished.execute("one", {})).details.status, "not_published");
  const failed = createActiveAlarmTool("demo", async () => { throw new Error("private API detail"); });
  const response = await failed.execute("two", {});
  assert.equal(response.details.status, "error");
  assert.equal(response.details.data, undefined);
  assert.ok(!JSON.stringify(response).includes("private API"));
});

test("取消信号传给固定业务读取接口", async () => {
  const controller = new AbortController();
  const tool = createActiveAlarmTool("demo", async (_page, signal) => {
    assert.equal(signal, controller.signal);
    return fixture();
  });
  assert.equal((await tool.execute("one", {}, controller.signal)).details.status, "ready");
});

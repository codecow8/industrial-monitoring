import assert from "node:assert/strict";
import { test } from "node:test";
import { Value } from "typebox/value";
import { HistoryError, validateHistory, type AlarmHistoryPage, type HistoryRead } from "./alarm-history.ts";
import { createAlarmHistoryTool } from "./alarm-history-tool.ts";

function fixture(offset = 0, total = 21, version = 1): AlarmHistoryPage {
  const records = Array.from({ length: Math.min(20, Math.max(total - offset, 0)) }, (_, index) => {
    const id = 100 + (offset + index) * 4;
    const observed = (id: number, value: number, receivedAt: string) => ({ id, value, receivedAt, sourceTimestamp: receivedAt });
    return { id: `threshold:pump1.outlet_temp:${id + 1}`, kind: "threshold" as const, title: "出口温度越界",
      deviceName: "1号冷却泵", dataKey: "pump1.outlet_temp", threshold: 80, unit: "°C", precision: 1,
      triggeredAt: "2026-10-02T10:01:00+00:00", recoveredAt: "2026-10-02T10:03:00+00:00",
      trigger: { from: observed(id, 75, "2026-10-02T10:00:00+00:00"), to: observed(id + 1, 83, "2026-10-02T10:01:00+00:00") },
      recovery: { from: observed(id + 2, 83, "2026-10-02T10:02:00+00:00"), to: observed(id + 3, 74, "2026-10-02T10:03:00+00:00") },
    };
  });
  return { pageId: "demo", version, windowStart: "2026-10-02T08:00:00+00:00", windowEnd: "2026-10-02T11:00:00+00:00",
    total, records, nextOffset: offset + 20 < total ? offset + 20 : null };
}

test("仅服务端绑定页面，首批20条、下一批保留截止时间与查询ID，返回原始依据", async () => {
  const calls: unknown[][] = [];
  const read: HistoryRead = async (...args) => { calls.push(args); return fixture(args[1]); };
  const tool = createAlarmHistoryTool("demo", read);
  const first = (await tool.execute("one", { action: "start" })).details;
  const next = (await tool.execute("two", { action: "next" })).details;
  assert.equal(first.status, "ready");
  assert.equal(first.data?.records.length, 20);
  assert.equal(next.data?.records.length, 1);
  assert.equal(next.queryId, first.queryId);
  assert.equal(calls[0][0], "demo");
  assert.equal(calls[0][1], 0);
  assert.equal(calls[1][1], 20);
  assert.equal(calls[1][2], first.data?.windowEnd);
  assert.deepEqual(first.data?.records[0].trigger, fixture().records[0].trigger);
  assert.equal((await tool.execute("three", { action: "next" })).details.status, "done");
  assert.equal(calls.length, 2);
  for (const params of [{ action: "start", pageId: "other" }, { action: "start", url: "https://example.com" }, { action: "next", offset: 100 }, { action: "start", limit: 100 }]) {
    assert.equal(Value.Check(tool.parameters, params), false);
  }
});

test("空记录不是没有活动告警；未开始不能继续", async () => {
  const tool = createAlarmHistoryTool("demo", async () => fixture(0, 0));
  assert.equal((await tool.execute("one", { action: "next" })).details.status, "error");
  const result = await tool.execute("two", { action: "start" });
  assert.equal(result.details.status, "empty");
  assert.ok(result.details.notice.includes("不代表没有活动告警"));
  assert.deepEqual(result.details.data?.records, []);
});

test("分页失败不冒充空结果，重试仍从相同游标读取", async () => {
  const offsets: number[] = [];
  let failed = false;
  const tool = createAlarmHistoryTool("demo", async (_page, offset) => {
    offsets.push(offset);
    if (offset === 20 && !failed) { failed = true; throw new Error("private API detail"); }
    return fixture(offset);
  });
  await tool.execute("one", { action: "start" });
  const failure = (await tool.execute("two", { action: "next" })).details;
  assert.equal(failure.status, "error");
  assert.equal(failure.data, undefined);
  assert.ok(!JSON.stringify(failure).includes("private API"));
  assert.equal((await tool.execute("three", { action: "next" })).details.status, "ready");
  assert.deepEqual(offsets, [0, 20, 20]);
});

test("版本变化使游标失效，不能混用新版本或继续旧查询", async () => {
  const tool = createAlarmHistoryTool("demo", async (_page, offset) => fixture(offset, 21, offset ? 2 : 1));
  await tool.execute("one", { action: "start" });
  assert.equal((await tool.execute("two", { action: "next" })).details.status, "version_changed");
  assert.equal((await tool.execute("three", { action: "next" })).details.status, "error");
  const rejected = createAlarmHistoryTool("demo", async () => { throw new HistoryError("VERSION_CHANGED", "发布变化"); });
  assert.equal((await rejected.execute("one", { action: "start" })).details.status, "version_changed");
  const unpublished = createAlarmHistoryTool("demo", async () => { throw new HistoryError("NOT_PUBLISHED", "尚未发布"); });
  assert.equal((await unpublished.execute("one", { action: "start" })).details.status, "not_published");
});

test("查询快照变化或重复记录使分页失效", async () => {
  for (const mode of ["cutoff", "duplicate", "total"]) {
    const tool = createAlarmHistoryTool("demo", async (_page, offset) => {
      const data = fixture(offset, mode === "total" && offset ? 22 : 21);
      if (offset && mode === "cutoff") data.windowEnd = "2026-10-02T11:01:00+00:00";
      if (offset && mode === "duplicate") data.records[0] = fixture().records[0];
      return data;
    });
    await tool.execute("one", { action: "start" });
    assert.equal((await tool.execute("two", { action: "next" })).details.status, "error");
    assert.equal((await tool.execute("three", { action: "next" })).details.status, "error");
  }
});

test("拒绝错误页面、分页、缺失或无法证明转折的记录合同", () => {
  const wrongPage = fixture(); wrongPage.pageId = "other";
  const wrongCount = fixture(); wrongCount.records.pop();
  const wrongTransition = fixture(); wrongTransition.records[0].trigger.from.value = 90;
  const noRecovery = fixture(); noRecovery.records[0].recoveredAt = "invalid";
  const duplicate = fixture(); duplicate.records[1] = duplicate.records[0];
  for (const data of [wrongPage, wrongCount, wrongTransition, noRecovery, duplicate, {}]) {
    assert.throws(() => validateHistory(data, "demo", 0));
  }
});

test("故障码转折可核对，取消信号传给读取接口，工具并发不改变游标", async () => {
  const data = fixture();
  const fault = data.records[0];
  fault.kind = "fault"; fault.stateCode = 2; fault.unit = null; delete fault.threshold;
  fault.trigger.from.value = 1; fault.trigger.to.value = 2;
  fault.recovery.from.value = 2; fault.recovery.to.value = 1;
  assert.equal(validateHistory(data, "demo", 0).records[0].kind, "fault");
  let release!: (value: AlarmHistoryPage) => void;
  const controller = new AbortController();
  const tool = createAlarmHistoryTool("demo", async (_page, _offset, _cutoff, signal) => {
    assert.equal(signal, controller.signal);
    return new Promise((resolve) => { release = resolve; });
  });
  const first = tool.execute("one", { action: "start" }, controller.signal);
  assert.equal((await tool.execute("two", { action: "start" })).details.status, "error");
  release(data);
  assert.equal((await first).details.status, "ready");
});

test("问答回退游标后重试不会跳过已读取的一批", async () => {
  const offsets: number[] = [];
  const tool = createAlarmHistoryTool("demo", async (_page, offset) => { offsets.push(offset); return fixture(offset); });
  await tool.execute("one", { action: "start" });
  const before = tool.checkpoint();
  const next = (await tool.execute("two", { action: "next" })).details;
  tool.restore(before);
  const retry = (await tool.execute("three", { action: "next" })).details;
  assert.deepEqual(offsets, [0, 20, 20]);
  assert.equal(next.queryId, retry.queryId);
  assert.deepEqual(next.data, retry.data);
});

test("明确查询编号可继续旧结果，不混用较新的查询截止时间", async () => {
  let starts = 0;
  const cutoffs: Array<string | undefined> = [];
  const tool = createAlarmHistoryTool("demo", async (_page, offset, cutoff) => {
    cutoffs.push(cutoff);
    const data = fixture(offset);
    data.windowEnd = cutoff ?? (++starts === 1 ? "2026-10-02T11:00:00+00:00" : "2026-10-02T12:00:00+00:00");
    return data;
  });
  const first = (await tool.execute("one", { action: "start" })).details;
  const second = (await tool.execute("two", { action: "start" })).details;
  assert.notEqual(first.queryId, second.queryId);
  tool.selectQuery(first.queryId!);
  const next = (await tool.execute("three", { action: "next" })).details;
  assert.equal(next.queryId, first.queryId);
  assert.equal(cutoffs[2], first.data?.windowEnd);
  assert.throws(() => tool.selectQuery("another-session-query"));
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { buildActiveReply } from "../src/conversation.ts";
import type { ActiveAlarmSnapshot } from "../src/active-alarms.ts";
import { checkActiveReply, type ActiveExpectation } from "./active-checks.ts";

const at = (milliseconds: number) => new Date(Date.UTC(2026, 9, 3) + milliseconds).toISOString();
function fixture({ partial = false, normal = false, stale = true } = {}) {
  const observations = [{ dataKey: "test.temp", id: 101, value: normal || partial ? 72 : 83,
    receivedAt: at(1000), sourceTimestamp: "2000-01-01T00:00:00Z" },
  ...(!partial ? [{ dataKey: "test.state", id: 102, value: normal ? 1 : 2,
    receivedAt: at(1000), sourceTimestamp: "2000-01-01T00:00:00Z" }] : [])];
  const plain = (item: typeof observations[number]) => {
    const { dataKey: _key, ...value } = item; return value;
  };
  const reference: ActiveAlarmSnapshot = {
    pageId: "eval-page", version: 1, publishedAt: at(0), windowStart: at(0),
    queriedAt: at(stale ? 7000 : 2000), staleAfterSeconds: 5,
    status: partial ? "partial" : stale ? "stale" : "ready",
    coverage: { configured: 2, observed: observations.length, missing: partial ? ["test.state"] : [],
      stale: stale ? observations.map(item => ({ dataKey: item.dataKey, observation: plain(item) })) : [] },
    total: normal || partial ? 0 : 2, omitted: 0,
    alarms: normal || partial ? [] : [
      { id: "fault:test.state:2", kind: "fault", title: "设备故障", deviceName: "验收泵", dataKey: "test.state",
        stateCode: 2, unit: null, precision: 0, freshness: stale ? "stale" : "fresh", observation: plain(observations[1]) },
      { id: "threshold:test.temp:80", kind: "threshold", title: "温度越界", deviceName: "验收泵", dataKey: "test.temp",
        threshold: 80, unit: "°C", precision: 1, freshness: stale ? "stale" : "fresh", observation: plain(observations[0]) },
    ],
  };
  const expected: ActiveExpectation = { reference, observations, previousQueryId: "old-query" };
  const reply = buildActiveReply({ status: reference.status, notice: "资料需核实", queryId: "new-query", data: structuredClone(reference) });
  return { reply, expected };
}

test("接受四例的实际结构事实，fresh 正常恢复不强制要求观测来源", () => {
  for (const options of [{}, { partial: true }, { normal: true }, { normal: true, stale: false }]) {
    const { reply, expected } = fixture(options);
    assert.deepEqual(checkActiveReply(reply, expected), []);
  }
});

test("拒绝错页、错版、错误缺数状态、丢失过期告警和旧快照", () => {
  for (const mutate of [
    (reply: ReturnType<typeof fixture>["reply"]) => { reply.active!.data!.pageId = "another-page"; },
    (reply: ReturnType<typeof fixture>["reply"]) => { reply.active!.data!.version = 2; },
    (reply: ReturnType<typeof fixture>["reply"]) => { reply.active!.data!.status = "ready"; },
    (reply: ReturnType<typeof fixture>["reply"]) => { reply.active!.data!.coverage.missing = ["test.temp"]; },
    (reply: ReturnType<typeof fixture>["reply"]) => { reply.active!.data!.alarms = []; reply.active!.data!.total = 0; },
    (reply: ReturnType<typeof fixture>["reply"]) => { reply.active!.queryId = "old-query"; },
    (reply: ReturnType<typeof fixture>["reply"]) => { reply.active!.data!.queriedAt = at(500); },
  ]) {
    const { reply, expected } = fixture();
    mutate(reply);
    assert.ok(checkActiveReply(reply, expected).length > 0);
  }
});

test("不能把只有部分正常值的资料标成 ready", () => {
  const { reply, expected } = fixture({ partial: true });
  reply.active!.status = "ready";
  reply.active!.data!.status = "ready";
  assert.ok(checkActiveReply(reply, expected).includes("缺数或过期状态不正确"));
});

test("拒绝虚构观测、被替换的来源正文、缺失来源和额外来源", () => {
  for (const mutate of [
    (reply: ReturnType<typeof fixture>["reply"]) => { reply.active!.data!.alarms[0].observation.id = 999; },
    (reply: ReturnType<typeof fixture>["reply"]) => { reply.sources[2].content = "{}"; },
    (reply: ReturnType<typeof fixture>["reply"]) => { reply.sources[2].content = "not JSON"; },
    (reply: ReturnType<typeof fixture>["reply"]) => { reply.sources.pop(); },
    (reply: ReturnType<typeof fixture>["reply"]) => { reply.sources.push({ source: "observation:999", title: "虚构", content: "{}" }); },
  ]) {
    const { reply, expected } = fixture();
    mutate(reply);
    assert.ok(checkActiveReply(reply, expected).length > 0);
  }
});

test("最终必须返回活动结果，不能以指南或历史结果代替", () => {
  const { reply, expected } = fixture();
  assert.ok(checkActiveReply({ answer: "请查看告警列表", sources: [] }, expected).length);
  reply.history = { status: "empty", notice: "历史为空" };
  assert.ok(checkActiveReply(reply, expected).includes("最终回复混入历史查询结果"));
});

test("回答较慢时按该次查询时间核对，接受已过期的最新恢复来源", () => {
  const { expected } = fixture({ normal: true, stale: false });
  const data = structuredClone(expected.reference);
  data.queriedAt = at(8000);
  data.status = "stale";
  data.coverage.stale = expected.observations.map(({ dataKey, ...observation }) => ({ dataKey, observation }));
  const reply = buildActiveReply({ status: "stale", notice: "需核实", queryId: "new-query", data });
  assert.deepEqual(checkActiveReply(reply, expected), []);
  // 同样是 0 条，但仍引用恢复前的来源，不能通过。
  reply.active!.data!.coverage.stale[0].observation.id = 99;
  assert.ok(checkActiveReply(reply, expected).length);
});

test("保留服务器微秒，4.9996 秒不能因毫秒截断被误判为过期", () => {
  const { expected } = fixture({ normal: true, stale: false });
  expected.observations.forEach(item => { item.receivedAt = "2026-10-03T00:00:01.000900+00:00"; });
  const data = structuredClone(expected.reference);
  data.queriedAt = "2026-10-03T00:00:06.000500+00:00";
  const reply = buildActiveReply({ status: "ready", notice: "本次观测", queryId: "new-query", data });
  assert.deepEqual(checkActiveReply(reply, expected), []);
  // 真正到达 5 秒时必须显示 stale，不能用同一个 ready 回答蒙混过去。
  reply.active!.data!.queriedAt = "2026-10-03T00:00:06.000900+00:00";
  assert.ok(checkActiveReply(reply, expected).includes("缺数或过期状态不正确"));
});

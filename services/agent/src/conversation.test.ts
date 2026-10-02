import assert from "node:assert/strict";
import { test } from "node:test";
import { buildGuideReply, buildHistoryReply, buildActiveReply } from "./conversation.ts";
import type { ActiveAlarmSnapshot } from "./active-alarms.ts";

const source = { source: "docs/product-guide.md", title: "保存草稿与发布版本", content: "点击发布版本，等待已发布提示。" };

test("API 来源正文取自真实检索资料，重复引用去重", () => {
  const citation = "【来源：docs/product-guide.md · 保存草稿与发布版本】";
  const reply = buildGuideReply(`请点击发布版本。${citation}${citation}`, [source]);
  assert.deepEqual(reply.sources, [source]);
});

test("拒绝未调用工具、缺少引用和引用未检索章节的回答", () => {
  assert.throws(() => buildGuideReply("已发布", undefined));
  assert.throws(() => buildGuideReply("点击发布版本", [source]));
  assert.throws(() => buildGuideReply("点击菜单【来源：docs/product-guide.md · 虚构章节】", [source]));
  assert.throws(() => buildGuideReply("【来源：docs/product-guide.md · 保存草稿与发布版本】【来源：fake.md · 其他资料】", [source]));
});

test("零匹配时返回固定资料不足说明，不使用模型的无依据回答", () => {
  const reply = buildGuideReply("系统支持自动设备控制", []);
  assert.ok(reply.answer.includes("未检索到相关资料"));
  assert.deepEqual(reply.sources, []);
  assert.ok(!reply.answer.includes("自动设备控制"));
});

test("历史总数、范围与来源只由已校验工具数据生成", () => {
  const data = { pageId: "demo", version: 2, windowStart: "2026-10-02T08:00:00Z", windowEnd: "2026-10-02T11:00:00Z", total: 0, records: [], nextOffset: null };
  const reply = buildHistoryReply({ status: "empty", notice: "本范围无完整记录，不代表没有活动告警。", queryId: "query-1", data });
  assert.ok(reply.answer.includes("不代表没有活动告警"));
  assert.equal(reply.sources[0].source, "history-query:query-1");
  assert.equal(JSON.parse(reply.sources[0].content).pageId, "demo");
  assert.throws(() => buildHistoryReply({ status: "error", notice: "失败" }));
  assert.throws(() => buildHistoryReply({ status: "ready", notice: "正常", data }));
});

test("活动告警回复保留查询时刻、缺数状态和实际来源，不让模型编写业务事实", () => {
  const data: ActiveAlarmSnapshot = {
    pageId: "demo", version: 1, publishedAt: "2026-10-02T09:00:00Z",
    queriedAt: "2026-10-02T10:00:01Z", windowStart: "2026-10-02T09:00:00Z", staleAfterSeconds: 5,
    status: "partial", coverage: { configured: 2, observed: 1, missing: ["pump.state"], stale: [] },
    total: 1, omitted: 0, alarms: [{ id: "threshold:pump.temp:80", kind: "threshold", title: "温度越界",
      deviceName: "泵", dataKey: "pump.temp", threshold: 80, unit: "°C", precision: 1, freshness: "fresh",
      observation: { id: 101, value: 83, receivedAt: "2026-10-02T10:00:00Z", sourceTimestamp: "device-time" } }],
  };
  const reply = buildActiveReply({ status: "partial", notice: "资料不完整，不能宣称一切正常。", queryId: "active-1", data });
  assert.equal(reply.active?.data?.queriedAt, data.queriedAt);
  assert.ok(reply.answer.includes("资料不完整"));
  assert.ok(reply.sources.some(item => item.source === "active-query:active-1"));
  assert.equal(JSON.parse(reply.sources.find(item => item.source === "observation:101")!.content).value, 83);
  assert.ok(reply.sources.some(item => item.source === "page:demo:v1"));
  assert.throws(() => buildActiveReply({ status: "error", notice: "失败" }));
  assert.throws(() => buildActiveReply({ status: "partial", notice: "正常", data }));
});

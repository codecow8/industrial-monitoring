import { isDeepStrictEqual } from "node:util";
import type { HelpReply } from "../src/conversation.ts";
import type { ActiveAlarmSnapshot } from "../src/active-alarms.ts";

export interface EvalObservation {
  dataKey: string;
  id: number;
  value: number;
  receivedAt: string;
  sourceTimestamp: string;
}

export interface ActiveExpectation {
  reference: ActiveAlarmSnapshot;
  observations: EvalObservation[];
  previousQueryId?: string;
}

function timestamp(value: string): number {
  // Python 返回微秒；Date.parse 会截掉后三位，恰在 5 秒边界时可能误判。
  const fraction = /\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/.exec(value)?.[1] ?? "";
  return Date.parse(value) + (fraction.length > 3 ? Number(`0.${fraction.slice(3)}`) : 0);
}

/** 独立业务 API 提供来源；按 Agent 自己的查询时刻判断过期，不按回答到达时间比较。 */
export function checkActiveReply(reply: HelpReply, expected: ActiveExpectation): string[] {
  const failures: string[] = [];
  const check = (ok: boolean, message: string) => { if (!ok) failures.push(message); };
  const active = reply.active;
  if (!active?.data) return ["未返回本轮活动告警查询结果"];
  const data = active.data;
  const reference = expected.reference;
  const queriedAt = timestamp(data.queriedAt);
  check(!reply.history, "最终回复混入历史查询结果");
  check(!!active.queryId && active.queryId !== expected.previousQueryId, "查询编号缺失或复用了旧快照");
  check(data.pageId === reference.pageId && data.version === reference.version &&
    data.publishedAt === reference.publishedAt, "页面或发布版本不正确");
  check(Number.isFinite(queriedAt) && queriedAt >= timestamp(reference.queriedAt), "查询时间早于本例准备完成，可能复用旧结果");
  check(data.staleAfterSeconds === 5 && timestamp(data.windowStart) ===
    Math.max(timestamp(reference.publishedAt), queriedAt - 24 * 60 * 60_000), "查询窗口或五秒标准不正确");
  check(expected.observations.length === reference.coverage.observed && expected.observations.every(item =>
    timestamp(item.receivedAt) <= queriedAt), "独立观测证据不完整或查询早于最新观测");

  const stale = expected.observations.filter(item => queriedAt - timestamp(item.receivedAt) >= 5000);
  const status = !reference.coverage.configured ? "unconfigured" : !expected.observations.length ? "no_data"
    : reference.coverage.missing.length ? "partial" : stale.length ? "stale" : "ready";
  check(active.status === status && data.status === status, "缺数或过期状态不正确");
  check(data.coverage.configured === reference.coverage.configured &&
    data.coverage.observed === expected.observations.length &&
    isDeepStrictEqual([...data.coverage.missing].sort(), [...reference.coverage.missing].sort()), "资料覆盖或缺数键不正确");
  const plainObservation = ({ dataKey: _key, ...observation }: EvalObservation) => observation;
  const expectedStale = stale.map(item => ({ dataKey: item.dataKey, observation: plainObservation(item) }));
  const byKey = <T extends { dataKey: string }>(items: T[]) => [...items].sort((a, b) => a.dataKey.localeCompare(b.dataKey));
  check(isDeepStrictEqual(byKey(data.coverage.stale), byKey(expectedStale)), "过期摘要未使用最新服务器观测");
  const expectedAlarms = reference.alarms.map(alarm => ({ ...alarm,
    freshness: stale.some(item => item.dataKey === alarm.dataKey) ? "stale" : "fresh" }));
  check(data.total === reference.total && data.omitted === reference.omitted &&
    isDeepStrictEqual(data.alarms, expectedAlarms), "告警数量、顺序、条件或观测来源不正确");

  const sourceContent = (id: string): unknown => {
    const matches = reply.sources.filter(source => source.source === id);
    if (matches.length !== 1) { failures.push(`来源缺失或重复：${id}`); return undefined; }
    try { return JSON.parse(matches[0].content); }
    catch { failures.push(`来源正文不是可核对 JSON：${id}`); return undefined; }
  };
  check(isDeepStrictEqual(sourceContent(`active-query:${active.queryId}`), {
    pageId: data.pageId, version: data.version, publishedAt: data.publishedAt,
    queriedAt: data.queriedAt, windowStart: data.windowStart, total: data.total,
    omitted: data.omitted, coverage: data.coverage,
  }), "查询来源正文与本次结果不一致");
  check(isDeepStrictEqual(sourceContent(`page:${reference.pageId}:v${reference.version}`), {
    publishedAt: reference.publishedAt,
    conditions: JSON.parse(JSON.stringify(reference.alarms.map(({ id, kind, dataKey, threshold, stateCode }) => ({ id, kind, dataKey, threshold, stateCode })))),
  }), "页面条件来源不一致");
  // fresh 正常值没有独立来源条目；只要求告警和过期摘要中实际引用的观测。
  const required = new Map([...reference.alarms.map(alarm => ({ dataKey: alarm.dataKey, ...alarm.observation })),
    ...stale].map(item => [item.id, item]));
  for (const item of required.values()) {
    check(isDeepStrictEqual(sourceContent(`observation:${item.id}`), item), `观测来源正文不一致：${item.id}`);
  }
  const allowed = new Set([`active-query:${active.queryId}`, `page:${reference.pageId}:v${reference.version}`,
    ...Array.from(required.keys(), id => `observation:${id}`)]);
  check(reply.sources.every(source => allowed.has(source.source)), "回复包含未经本例证实的来源");
  return failures;
}

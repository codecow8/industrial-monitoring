import type { PageSchema } from "@industrial/schema";
import type { ActiveAlarmView } from "@industrial/renderer-core/active-alarms";
import { request } from "./http";

export type PublishedPage = { pageId: string; version: number; publishedAt: string; schema: PageSchema };
export type Observation = { id: number; value: number; receivedAt: string; sourceTimestamp: string };
export type Evidence = { pageId: string; version: number; observations: Observation[]; truncated: boolean; window: { start: string; end: string } };
export type HistoryRecord = {
  id: string; title: string; deviceName: string; kind: "fault" | "threshold"; dataKey: string;
  threshold?: number; stateCode?: number; unit: string | null; precision: number;
  triggeredAt: string; recoveredAt: string;
  trigger: { from: Observation; to: Observation }; recovery: { from: Observation; to: Observation };
};
export type HistoryPage = { pageId: string; version: number; windowStart: string; windowEnd: string; total: number; records: HistoryRecord[]; nextOffset: number | null };
export type Diagnosis = {
  status: "completed" | "insufficient_evidence";
  alarm: { pageId: string; version: number };
  observedFacts: { text: string; sourceIds: string[] }[];
  possibleCauses: { text: string; sourceIds: string[] }[];
  recommendedChecks: { text: string; sourceIds: string[] }[];
  sources: { id: string; title?: string; excerpt?: string; value?: number; receivedAt?: string }[];
};
const pagePath = (pageId: string) => `/api/pages/${encodeURIComponent(pageId)}`;
const query = (values: Record<string, string | number>) => Object.entries(values).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
export function loadPublished(pageId: string) { return request<PublishedPage | null>(`${pagePath(pageId)}/published`); }
export function assertVersion(result: { pageId: string; version: number }, page: PublishedPage) {
  if (result.pageId !== page.pageId || result.version !== page.version) throw new Error("页面已发布新版本，请返回监控刷新后重试。");
}
export async function loadEvidence(page: PublishedPage, alarm: ActiveAlarmView) {
  const snapshot = await request<{ pageId: string; version: number; queriedAt: string }>(`${pagePath(page.pageId)}/active-alarms`);
  assertVersion(snapshot, page);
  const end = snapshot.queriedAt;
  const params: Record<string, string | number> = { kind: alarm.kind, dataKey: alarm.dataKey, end, start: new Date(Date.parse(end) - 5 * 60_000).toISOString() };
  if (alarm.threshold !== null) params.threshold = alarm.threshold;
  const result = await request<Evidence>(`${pagePath(page.pageId)}/alarm-evidence?${query(params)}`);
  assertVersion(result, page);
  return result;
}
export async function loadHistory(page: PublishedPage, offset = 0, asOf?: string) {
  const params: Record<string, string | number> = { limit: 20, offset };
  if (asOf) params.asOf = asOf;
  const result = await request<HistoryPage>(`${pagePath(page.pageId)}/alarm-history?${query(params)}`);
  assertVersion(result, page);
  return result;
}
export async function diagnose(page: PublishedPage, alarm: ActiveAlarmView) {
  const result = await request<Diagnosis>(`${pagePath(page.pageId)}/alarm-diagnoses`, "POST", {
    kind: alarm.kind, dataKey: alarm.dataKey, ...(alarm.threshold !== null ? { threshold: alarm.threshold } : {}),
  });
  assertVersion(result.alarm, page);
  return result;
}
export function formatTime(value: string) { return new Date(value).toLocaleString("zh-CN", { hour12: false }); }

import {
  clonePageSchema,
  createSeedPageSchema,
  isPageSchema,
  type PageSchema,
} from "@industrial/schema";
import type { ActiveAlarmView } from "@industrial/renderer-core";

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "/api";

export type DiagnosisStatement = { text: string; sourceIds: string[] };
export type DiagnosisSource = { id: string; type: "observation" | "manual" | "page"; title?: string; excerpt?: string; value?: number; receivedAt?: string };
export type AlarmDiagnosis = {
  status: "completed" | "insufficient_evidence";
  alarm: { pageId: string; version: number; condition: { kind: string; dataKey: string } };
  observedFacts: DiagnosisStatement[];
  possibleCauses: DiagnosisStatement[];
  recommendedChecks: DiagnosisStatement[];
  sources: DiagnosisSource[];
  dataFreshness: { windowStart: string; windowEnd: string; latestReceivedAt: string; stale: boolean };
};

export async function diagnoseAlarm(pageId: string, alarm: ActiveAlarmView): Promise<AlarmDiagnosis> {
  const response = await fetch(`${apiBase}/pages/${encodeURIComponent(pageId)}/alarm-diagnoses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: alarm.kind, dataKey: alarm.dataKey, threshold: alarm.threshold }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(body?.detail ?? `分析失败（${response.status}）`);
  }
  return await response.json() as AlarmDiagnosis;
}

export type HistoryObservation = { id: number; value: number; receivedAt: string; sourceTimestamp: string };
export type HistoryTransition = { from: HistoryObservation; to: HistoryObservation };
export type AlarmHistoryRecord = {
  id: string;
  kind: "threshold" | "fault";
  title: string;
  deviceName: string;
  dataKey: string;
  threshold?: number;
  stateCode?: number;
  unit: string | null;
  precision: number;
  triggeredAt: string;
  recoveredAt: string;
  trigger: HistoryTransition;
  recovery: HistoryTransition;
};
export type AlarmHistoryPage = {
  pageId: string;
  version: number;
  windowStart: string;
  windowEnd: string;
  total: number;
  records: AlarmHistoryRecord[];
  nextOffset: number | null;
};

export async function loadAlarmHistory(pageId: string, offset = 0, asOf?: string): Promise<AlarmHistoryPage> {
  const params = new URLSearchParams({ limit: "20", offset: String(offset) });
  if (asOf) params.set("asOf", asOf);
  const response = await fetch(`${apiBase}/pages/${encodeURIComponent(pageId)}/alarm-history?${params}`);
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(body?.detail ?? `加载历史告警失败（${response.status}）`);
  }
  return await response.json() as AlarmHistoryPage;
}

export type PublishedPage = {
  pageId: string;
  version: number;
  schema: PageSchema;
  publishedAt: string;
};

function parsePublishedPage(value: unknown): PublishedPage {
  if (
    typeof value !== "object" || value === null ||
    !("pageId" in value) || typeof value.pageId !== "string" ||
    !("version" in value) || typeof value.version !== "number" ||
    !("publishedAt" in value) || typeof value.publishedAt !== "string" ||
    !("schema" in value) || !isPageSchema(value.schema)
  ) {
    throw new Error("后端返回了不符合合同的发布版本");
  }
  return {
    pageId: value.pageId,
    version: value.version,
    schema: clonePageSchema(value.schema),
    publishedAt: value.publishedAt,
  };
}

export async function loadPageSchema(pageId: string): Promise<PageSchema> {
  const response = await fetch(`${apiBase}/pages/${encodeURIComponent(pageId)}/draft`);
  if (response.status === 204) return createSeedPageSchema(pageId);
  if (!response.ok) throw new Error(`加载草稿失败（${response.status}）`);

  const value: unknown = await response.json();
  if (!isPageSchema(value)) throw new Error("后端返回了不符合合同的 PageSchema");
  return clonePageSchema(value);
}

export async function savePageSchema(schema: PageSchema): Promise<PageSchema> {
  const response = await fetch(`${apiBase}/pages/${encodeURIComponent(schema.id)}/draft`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(schema),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(error?.detail ?? `保存草稿失败（${response.status}）`);
  }

  const value: unknown = await response.json();
  if (!isPageSchema(value)) throw new Error("后端返回了不符合合同的 PageSchema");
  return clonePageSchema(value);
}

export async function publishPage(pageId: string): Promise<PublishedPage> {
  const response = await fetch(`${apiBase}/pages/${encodeURIComponent(pageId)}/publish`, {
    method: "POST",
  });
  if (!response.ok) throw new Error(`发布页面失败（${response.status}）`);
  return parsePublishedPage(await response.json());
}

export async function loadPublishedPage(pageId: string): Promise<PublishedPage | null> {
  const response = await fetch(`${apiBase}/pages/${encodeURIComponent(pageId)}/published`);
  if (response.status === 204) return null;
  if (!response.ok) throw new Error(`加载发布版本失败（${response.status}）`);
  return parsePublishedPage(await response.json());
}

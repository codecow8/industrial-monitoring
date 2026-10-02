import { get } from "node:http";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";

const observation = Type.Object({ id: Type.Integer({ minimum: 1 }), value: Type.Number(),
  receivedAt: Type.String(), sourceTimestamp: Type.String() });
const snapshot = Type.Object({
  pageId: Type.String(), version: Type.Integer({ minimum: 1 }), publishedAt: Type.String(),
  queriedAt: Type.String(), windowStart: Type.String(), staleAfterSeconds: Type.Literal(5),
  status: Type.Union([Type.Literal("ready"), Type.Literal("partial"), Type.Literal("stale"), Type.Literal("no_data"), Type.Literal("unconfigured")]),
  coverage: Type.Object({ configured: Type.Integer({ minimum: 0 }), observed: Type.Integer({ minimum: 0 }),
    missing: Type.Array(Type.String()), stale: Type.Array(Type.Object({ dataKey: Type.String(), observation })) }),
  total: Type.Integer({ minimum: 0 }), omitted: Type.Integer({ minimum: 0 }),
  alarms: Type.Array(Type.Object({
    id: Type.String(), kind: Type.Union([Type.Literal("threshold"), Type.Literal("fault")]),
    title: Type.String(), deviceName: Type.String(), dataKey: Type.String(),
    threshold: Type.Optional(Type.Number()), stateCode: Type.Optional(Type.Number()),
    unit: Type.Union([Type.String(), Type.Null()]), precision: Type.Integer({ minimum: 0, maximum: 20 }),
    freshness: Type.Union([Type.Literal("fresh"), Type.Literal("stale")]), observation,
  }), { maxItems: 20 }),
});

export type ActiveAlarmSnapshot = Static<typeof snapshot>;
export type ActiveAlarmRead = (pageId: string, signal?: AbortSignal) => Promise<ActiveAlarmSnapshot>;
export class ActiveAlarmError extends Error {
  readonly code: "NOT_PUBLISHED" | "INVALID_RESPONSE" | "QUERY_FAILED";
  constructor(code: ActiveAlarmError["code"], message: string) { super(message); this.code = code; }
}

/** 检查来源时间、覆盖率与触发条件，避免错误响应被当成“当前正常”。 */
export function validateActiveAlarms(value: unknown, pageId: string): ActiveAlarmSnapshot {
  const invalid = () => { throw new ActiveAlarmError("INVALID_RESPONSE", "活动告警响应不符合页面、时间或资料合同。"); };
  if (!Value.Check(snapshot, value) || value.pageId !== pageId) return invalid();
  const data = value;
  const start = Date.parse(data.windowStart), end = Date.parse(data.queriedAt), published = Date.parse(data.publishedAt);
  const coverage = data.coverage;
  const missing = new Set(coverage.missing);
  const stale = new Map(coverage.stale.map((item) => [item.dataKey, item.observation]));
  const status = coverage.configured === 0 ? "unconfigured" : coverage.observed === 0 ? "no_data"
    : missing.size ? "partial" : stale.size ? "stale" : "ready";
  if (![start, end, published].every(Number.isFinite) || start !== Math.max(published, end - 24 * 60 * 60_000)
    || start > end || missing.size !== coverage.missing.length || stale.size !== coverage.stale.length
    || coverage.configured !== coverage.observed + missing.size || stale.size > coverage.observed
    || data.status !== status || data.omitted !== Math.max(data.total - 20, 0)
    || data.alarms.length !== Math.min(data.total, 20) || (coverage.observed === 0 && data.total !== 0)
    || new Set(data.alarms.map((item) => item.id)).size !== data.alarms.length) return invalid();

  const validObservation = (item: Static<typeof observation>) => {
    const received = Date.parse(item.receivedAt);
    return Number.isFinite(received) && received >= start && received <= end;
  };
  for (const item of coverage.stale) {
    // JavaScript 时间精度为毫秒，容许 1ms 的舍入误差，不把设备时间戳用于新鲜度。
    if (missing.has(item.dataKey) || !validObservation(item.observation)
      || end - Date.parse(item.observation.receivedAt) < 4999) return invalid();
  }
  for (const alarm of data.alarms) {
    const source = alarm.observation;
    const staleSource = stale.get(alarm.dataKey);
    const triggered = alarm.kind === "fault" ? alarm.stateCode === 2 && source.value === 2
      : typeof alarm.threshold === "number" && source.value >= alarm.threshold;
    if (!triggered || missing.has(alarm.dataKey) || !validObservation(source)
      || (alarm.freshness === "stale") !== !!staleSource
      || (staleSource && (staleSource.id !== source.id || staleSource.value !== source.value || staleSource.receivedAt !== source.receivedAt))
      || (alarm.freshness === "fresh" && end - Date.parse(source.receivedAt) > 5000)) return invalid();
  }
  return data;
}

/** 地址固定为本机业务 API，模型不能指定 URL、页面或读取其他网络资源。 */
export const readActiveAlarms: ActiveAlarmRead = async (pageId, signal) => {
  const data = await new Promise<unknown>((resolve, reject) => {
    const request = get({ hostname: "127.0.0.1", port: 8000,
      path: `/api/pages/${encodeURIComponent(pageId)}/active-alarms`, signal }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 256 * 1024) response.destroy(new ActiveAlarmError("INVALID_RESPONSE", "活动告警响应超过大小限制。"));
        else chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => {
        if (response.statusCode === 404) return reject(new ActiveAlarmError("NOT_PUBLISHED", "当前页面尚未发布，请先手动发布。"));
        if (response.statusCode !== 200) return reject(new ActiveAlarmError("QUERY_FAILED", "查询失败，无法判断是否有活动告警。"));
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
        catch { reject(new ActiveAlarmError("INVALID_RESPONSE", "活动告警响应无法读取。")); }
      });
    });
    request.setTimeout(10_000, () => request.destroy(new ActiveAlarmError("QUERY_FAILED", "活动告警查询超时。")));
    request.on("error", reject);
  });
  return validateActiveAlarms(data, pageId);
};

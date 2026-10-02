import { get } from "node:http";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";

const observation = Type.Object({
  id: Type.Integer({ minimum: 1 }),
  value: Type.Number(),
  receivedAt: Type.String(),
  sourceTimestamp: Type.String(),
});
const transition = Type.Object({ from: observation, to: observation });
const record = Type.Object({
  id: Type.String(),
  kind: Type.Union([Type.Literal("threshold"), Type.Literal("fault")]),
  title: Type.String(),
  deviceName: Type.String(),
  dataKey: Type.String(),
  threshold: Type.Optional(Type.Number()),
  stateCode: Type.Optional(Type.Number()),
  unit: Type.Union([Type.String(), Type.Null()]),
  precision: Type.Integer({ minimum: 0 }),
  triggeredAt: Type.String(),
  recoveredAt: Type.String(),
  trigger: transition,
  recovery: transition,
});
const page = Type.Object({
  pageId: Type.String(),
  version: Type.Integer({ minimum: 1 }),
  windowStart: Type.String(),
  windowEnd: Type.String(),
  total: Type.Integer({ minimum: 0 }),
  records: Type.Array(record, { maxItems: 20 }),
  nextOffset: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
});
export type AlarmHistoryPage = Static<typeof page>;
export type HistoryRead = (
  pageId: string,
  offset: number,
  asOf?: string,
  signal?: AbortSignal,
) => Promise<AlarmHistoryPage>;

export class HistoryError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** 检查公开接口合同与绑定页面，不让错误响应被当作可引用的业务记录。 */
export function validateHistory(
  value: unknown,
  pageId: string,
  offset: number,
): AlarmHistoryPage {
  if (!Value.Check(page, value) || value.pageId !== pageId)
    throw new HistoryError("INVALID_RESPONSE", "历史接口返回格式或页面不符。");
  const data = value;
  const start = Date.parse(data.windowStart),
    end = Date.parse(data.windowEnd);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start > end ||
    end - start > 24 * 60 * 60_000 ||
    data.records.length !== Math.min(20, Math.max(data.total - offset, 0)) ||
    data.nextOffset !== (offset + 20 < data.total ? offset + 20 : null) ||
    new Set(data.records.map((item) => item.id)).size !== data.records.length
  ) {
    throw new HistoryError(
      "INVALID_RESPONSE",
      "历史接口的时间窗或分页信息不符合合同。",
    );
  }
  for (const item of data.records) {
    const triggered = Date.parse(item.triggeredAt),
      recovered = Date.parse(item.recoveredAt);
    const beforeTrigger = Date.parse(item.trigger.from.receivedAt),
      beforeRecovery = Date.parse(item.recovery.from.receivedAt);
    const threshold = item.threshold;
    const validTransition =
      item.kind === "threshold"
        ? typeof threshold === "number" &&
          item.trigger.from.value < threshold &&
          item.trigger.to.value >= threshold &&
          item.recovery.from.value >= threshold &&
          item.recovery.to.value < threshold
        : item.stateCode === 2 &&
          item.trigger.from.value !== 2 &&
          item.trigger.to.value === 2 &&
          item.recovery.from.value === 2 &&
          item.recovery.to.value !== 2;
    if (
      !Number.isFinite(triggered) ||
      !Number.isFinite(recovered) ||
      triggered < start ||
      recovered > end ||
      triggered > recovered ||
      !Number.isFinite(beforeTrigger) ||
      beforeTrigger < start ||
      beforeTrigger > triggered ||
      !Number.isFinite(beforeRecovery) ||
      beforeRecovery < triggered ||
      beforeRecovery > recovered ||
      !validTransition ||
      item.trigger.to.receivedAt !== item.triggeredAt ||
      item.recovery.to.receivedAt !== item.recoveredAt
    ) {
      throw new HistoryError(
        "INVALID_RESPONSE",
        "记录缺少可核对的触发或恢复时间。",
      );
    }
  }
  return data;
}

/** 固定本机 GET；使用 Node HTTP 而非环境代理，业务记录不会被发往模型指定地址或代理。 */
export const readAlarmHistory: HistoryRead = async (
  pageId,
  offset,
  asOf,
  signal,
) => {
  const params = new URLSearchParams({ limit: "20", offset: String(offset) });
  if (asOf) params.set("asOf", asOf);
  const data = await new Promise<unknown>((resolve, reject) => {
    const request = get(
      {
        hostname: "127.0.0.1",
        port: 8000,
        path: `/api/pages/${encodeURIComponent(pageId)}/alarm-history?${params}`,
        signal,
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 256 * 1024)
            response.destroy(
              new HistoryError("INVALID_RESPONSE", "历史响应超过大小限制。"),
            );
          else chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () => {
          if (response.statusCode === 404)
            return reject(
              new HistoryError(
                "NOT_PUBLISHED",
                "当前页面没有可查询的发布版本。",
              ),
            );
          if (response.statusCode === 409)
            return reject(
              new HistoryError(
                "VERSION_CHANGED",
                "发布版本已变化，请重新查询。",
              ),
            );
          if (response.statusCode !== 200)
            return reject(
              new HistoryError(
                "QUERY_FAILED",
                "历史查询失败，无法判断是否有记录。",
              ),
            );
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            reject(
              new HistoryError("INVALID_RESPONSE", "历史响应不是有效 JSON。"),
            );
          }
        });
      },
    );
    request.setTimeout(10_000, () =>
      request.destroy(
        new HistoryError("QUERY_FAILED", "历史查询超时，请重试。"),
      ),
    );
    request.on("error", reject);
  });
  return validateHistory(data, pageId, offset);
};

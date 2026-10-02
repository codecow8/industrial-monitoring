import { randomUUID } from "node:crypto";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { HistoryError, readAlarmHistory, validateHistory, type AlarmHistoryPage, type HistoryRead } from "./alarm-history.ts";

const parameters = Type.Object({ action: Type.Union([Type.Literal("start"), Type.Literal("next")]) }, { additionalProperties: false });
export interface HistoryToolResult {
  status: "ready" | "empty" | "done" | "not_published" | "version_changed" | "error";
  notice: string;
  queryId?: string;
  data?: AlarmHistoryPage;
}

/** 页面由服务端闭包绑定，模型只选择开始或继续，不能传页面、URL、时间窗或条数。 */
export function createAlarmHistoryTool(pageId: string, read: HistoryRead = readAlarmHistory) {
  let snapshot: { queryId: string; data: AlarmHistoryPage; seen: Set<string> } | undefined;
  let busy = false;
  const queries = new Map<string, NonNullable<typeof snapshot>>();
  const result = (details: HistoryToolResult) => ({ content: [{ type: "text" as const, text: JSON.stringify(details) }], details });
  const tool = {
    name: "read_alarm_history",
    label: "查询当前页面历史告警",
    description: "只读查询服务端绑定页面的当前发布版本内已恢复历史。每批20条，最近24小时内且受发布时间限制。start 开始新查询，next 延续固定截止时间；不包含活动告警，不推断根因。",
    parameters,
    executionMode: "sequential" as const,
    execute: async (_id: string, params: { action: "start" | "next" }, signal?: AbortSignal) => {
      if (busy) return result({ status: "error", notice: "查询正在执行，请等待，不要并发改变分页。" });
      if (params.action === "next" && !snapshot) return result({ status: "error", notice: "没有可继续的查询，请先 start。" });
      if (params.action === "next" && snapshot?.data.nextOffset === null) return result({ status: "done", queryId: snapshot.queryId, notice: "本次查询已全部返回，没有新增记录。" });
      const previous = params.action === "next" ? snapshot : undefined;
      const offset = previous?.data.nextOffset ?? 0;
      // start 立即废弃旧游标；请求失败也不能悄悄继续之前的查询。
      if (params.action === "start") snapshot = undefined;
      busy = true;
      try {
        const data = validateHistory(await read(pageId, offset, previous?.data.windowEnd, signal), pageId, offset);
        if (previous && data.version !== previous.data.version) {
          snapshot = undefined;
          return result({ status: "version_changed", notice: "发布版本已变化，旧查询不能继续，请 start 新查询。" });
        }
        if (previous && (data.windowEnd !== previous.data.windowEnd || data.windowStart !== previous.data.windowStart
          || data.total !== previous.data.total || data.records.some((item) => previous.seen.has(item.id)))) {
          snapshot = undefined;
          return result({ status: "error", notice: "查询快照或记录已变化，不能混合分页，请 start 新查询。" });
        }
        const seen = new Set(previous?.seen);
        data.records.forEach((item) => seen.add(item.id));
        snapshot = { queryId: previous?.queryId ?? randomUUID(), data, seen };
        queries.set(snapshot.queryId, snapshot);
        return result({
          status: data.total === 0 ? "empty" : "ready", queryId: snapshot.queryId, data,
          notice: data.total === 0 ? "本范围内无可证明触发并恢复的完整记录，不代表没有活动告警。"
            : "以下为接口真实记录；仅说明观测到的触发和恢复，不推断根因。引用记录ID或查询ID，未展示部分不能编造。",
        });
      } catch (error) {
        if (error instanceof HistoryError && ["VERSION_CHANGED", "NOT_PUBLISHED"].includes(error.code)) {
          snapshot = undefined;
          return result({ status: error.code === "VERSION_CHANGED" ? "version_changed" : "not_published", notice: error.message });
        }
        return result({ status: "error", notice: "历史查询未成功，不能判断是否有记录；可重试当前动作。" });
      } finally { busy = false; }
    },
  } satisfies ToolDefinition<typeof parameters, HistoryToolResult>;
  // 模型不能调用这两个服务端方法；用于整轮问答失败时回退游标，防止重试跳过一批。
  return Object.assign(tool, {
    checkpoint: () => snapshot ? structuredClone(snapshot) : undefined,
    restore: (previous: typeof snapshot) => { snapshot = previous; if (previous) queries.set(previous.queryId, previous); },
    selectQuery: (queryId: string) => {
      const selected = queries.get(queryId);
      if (!selected) throw new Error("当前会话没有此查询。");
      snapshot = selected;
    },
  });
}

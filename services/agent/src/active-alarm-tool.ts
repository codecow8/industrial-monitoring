import { randomUUID } from "node:crypto";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { ActiveAlarmError, readActiveAlarms, validateActiveAlarms, type ActiveAlarmRead, type ActiveAlarmSnapshot } from "./active-alarms.ts";

const parameters = Type.Object({}, { additionalProperties: false });
export interface ActiveAlarmToolResult {
  status: ActiveAlarmSnapshot["status"] | "not_published" | "error";
  notice: string;
  queryId?: string;
  data?: ActiveAlarmSnapshot;
}

/** 每次调用读取一次新快照；模型只有查询权，页面由服务器闭包绑定。 */
export function createActiveAlarmTool(pageId: string, read: ActiveAlarmRead = readActiveAlarms) {
  return {
    name: "read_active_alarms", label: "查询当前页面活动告警",
    description: "只读查询绑定页面当前发布版本后的最新服务器观测。5秒未更新为过期，保留最后观测触发的告警。最多20条，故障优先，附总数、缺数和过期摘要。无分页，不推断告警起点、设备当前健康或根因。",
    parameters, executionMode: "sequential",
    execute: async (_id: string, _params: Record<string, never>, signal?: AbortSignal) => {
      let details: ActiveAlarmToolResult;
      try {
        const data = validateActiveAlarms(await read(pageId, signal), pageId);
        const notices = {
          unconfigured: "当前发布页面没有配置告警条件，不代表设备正常。",
          no_data: "本次范围内没有可用观测，不能判断当前告警或设备状态。",
          partial: "部分数据项缺少观测，资料不完整；已有告警可核对，不能宣称一切正常。",
          stale: "部分观测已过期；保留最后观测触发的告警，当前状态需核实。",
          ready: "以下为本次服务器观测及配置计算的结果，不代表设备健康或根因结论。",
        };
        details = { status: data.status, data, queryId: randomUUID(), notice: notices[data.status] };
      } catch (error) {
        details = error instanceof ActiveAlarmError && error.code === "NOT_PUBLISHED"
          ? { status: "not_published", notice: error.message }
          : { status: "error", notice: "本次活动告警查询未成功，不能据此判断有没有告警；可重试。" };
      }
      // 同一份业务资料交给模型和服务端；后续引用必须来自这些观测与查询编号。
      return { content: [{ type: "text", text: JSON.stringify(details) }], details };
    },
  } satisfies ToolDefinition<typeof parameters, ActiveAlarmToolResult>;
}

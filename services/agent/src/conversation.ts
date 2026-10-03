import { createHelpSession } from "./session.ts";
import type { GuideToolDetails } from "./guide-tool.ts";
import { createAlarmHistoryTool, type HistoryToolResult } from "./alarm-history-tool.ts";
import { createActiveAlarmTool, type ActiveAlarmToolResult } from "./active-alarm-tool.ts";
import { validateActiveAlarms } from "./active-alarms.ts";

export interface GuideSource {
  source: string;
  title: string;
  content: string;
}
export interface HelpReply {
  answer: string;
  sources: GuideSource[];
  history?: HistoryToolResult;
  active?: ActiveAlarmToolResult;
}
export interface HelpConversation {
  /** 内部验收元数据来自实际 Pi 会话，不加入面向网页的响应。 */
  readonly model?: { provider: string; id: string };
  ask(question: string, signal: AbortSignal, command?: HistoryCommand): Promise<HelpReply>;
  dispose(): void;
}
export type HistoryCommand = { action: "start" | "next"; queryId?: string };

/** 只返回本轮工具实际检索到、且模型实际引用的章节；不信任模型生成的来源正文。 */
export function buildGuideReply(answer: string, retrieved: GuideSource[] | undefined): HelpReply {
  if (!retrieved) throw new Error("模型未调用指南检索工具。");
  if (retrieved.length === 0) return {
    answer: "操作指南中未检索到相关资料，暂时无法给出有依据的操作步骤。请补充问题或相关文档。",
    sources: [],
  };
  const titles = [...answer.matchAll(/【来源：([^】]+)】/g)].map((match) => {
    const citation = /^docs\/product-guide\.md\s*·\s*(.+)$/.exec(match[1].trim());
    if (!citation) throw new Error("回答引用了未授权的资料来源。");
    return citation[1].trim();
  });
  if (!answer.trim() || titles.length === 0) throw new Error("回答缺少指南来源。");
  const sources = [...new Set(titles)].map((title) => {
    const source = retrieved.find((item) => item.title === title);
    if (!source) throw new Error("回答引用了本轮未检索到的章节。");
    return source;
  });
  return { answer, sources };
}

/** 业务事实和来源从已校验的工具结果生成，不接受模型自行补充数量或观测值。 */
export function buildHistoryReply(history: HistoryToolResult): HelpReply {
  if (history.status === "error") throw new Error("历史查询失败。");
  const data = history.data;
  if (!data) return { answer: history.notice, sources: [], history };
  if (!history.queryId) throw new Error("历史查询缺少来源标识。");
  const sources: GuideSource[] = [{ source: `history-query:${history.queryId}`, title: `查询范围 · ${data.pageId} · v${data.version}`,
    content: JSON.stringify({ pageId: data.pageId, version: data.version, windowStart: data.windowStart, windowEnd: data.windowEnd, total: data.total }) },
  ...data.records.map((record) => ({ source: `history-record:${record.id}`, title: `${record.title} · ${record.triggeredAt}`,
    content: JSON.stringify(record) }))];
  const answer = history.status === "empty" ? history.notice
    : `当前页面 ${data.pageId} · 发布版本 v${data.version}，查询范围 ${data.windowStart} — ${data.windowEnd}。共 ${data.total} 条可证明触发并恢复的历史记录，本批展示 ${data.records.length} 条。${data.nextOffset === null ? "本次已全部返回。" : "可继续查看下一批。"}不代表当前活动告警，也不确定故障原因。`;
  return { answer, sources, history };
}

/** 活动结果对应查询时刻；数量、覆盖率与来源都由业务资料生成，不接受模型补写。 */
export function buildActiveReply(active: ActiveAlarmToolResult): HelpReply {
  if (active.status === "error") throw new Error("活动告警查询失败。");
  if (!active.data) return { answer: active.notice, sources: [], active };
  if (!active.queryId) throw new Error("活动查询缺少来源标识。");
  const data = validateActiveAlarms(active.data, active.data.pageId);
  if (active.status !== data.status) throw new Error("活动查询状态不一致。");
  const sources: GuideSource[] = [{ source: `active-query:${active.queryId}`, title: `活动查询 · ${data.pageId} · v${data.version}`,
    content: JSON.stringify({ pageId: data.pageId, version: data.version, publishedAt: data.publishedAt,
      queriedAt: data.queriedAt, windowStart: data.windowStart, total: data.total, omitted: data.omitted, coverage: data.coverage }) },
    { source: `page:${data.pageId}:v${data.version}`, title: `页面条件 · v${data.version}`,
      content: JSON.stringify({ publishedAt: data.publishedAt, conditions: data.alarms.map(({ id, kind, dataKey, threshold, stateCode }) => ({ id, kind, dataKey, threshold, stateCode })) }) }];
  const seen = new Set<number>();
  for (const item of [...data.alarms, ...data.coverage.stale]) {
    if (seen.has(item.observation.id)) continue;
    seen.add(item.observation.id);
    sources.push({ source: `observation:${item.observation.id}`, title: `${item.dataKey} · 服务器观测`,
      content: JSON.stringify({ dataKey: item.dataKey, ...item.observation }) });
  }
  const answer = `当前页面 ${data.pageId} · v${data.version}，查询时刻 ${data.queriedAt}。本次已观测触发 ${data.total} 条，展示 ${data.alarms.length} 条，另有 ${data.omitted} 条未展示。${active.notice}`;
  return { answer, sources, active };
}

export async function createHelpConversation(context: { pageId?: string } = {}): Promise<HelpConversation> {
  const historyTool = context.pageId ? createAlarmHistoryTool(context.pageId) : undefined;
  const activeTool = context.pageId ? createActiveAlarmTool(context.pageId) : undefined;
  let activeResult: ActiveAlarmToolResult | undefined;
  const activeExecute = activeTool?.execute;
  if (activeTool && activeExecute) activeTool.execute = async (id, params, signal) => {
    // 一轮内重复调用只复用一次观测快照；下一轮用户明确重新查询才读取新资料。
    if (activeResult) return { content: [{ type: "text", text: JSON.stringify(activeResult) }], details: activeResult };
    const result = await activeExecute(id, params, signal);
    activeResult = result.details;
    return result;
  };
  let historyResult: HistoryToolResult | undefined;
  const getHistoryResult = (): HistoryToolResult | undefined => historyResult;
  let allowNext = false;
  let historyCommand: HistoryCommand | undefined;
  const originalExecute = historyTool?.execute;
  if (historyTool && originalExecute) historyTool.execute = async (id, params, signal) => {
    // 模型不能自行读完所有页；一个用户轮次最多一次新批次，重复调用只复用结果。
    if (historyResult) {
      const done: HistoryToolResult = { status: "done", queryId: historyResult.queryId, notice: "本轮已执行一批查询，以首次返回状态及资料为准。不能自动再翻页，需要用户下一轮请求。" };
      return { content: [{ type: "text", text: JSON.stringify(done) }], details: done };
    }
    const action = historyCommand?.action ?? params.action;
    if (action === "next" && !allowNext) {
      historyResult = { status: "error", notice: "用户未明确继续，不能自动翻到下一批。" };
      return { content: [{ type: "text", text: JSON.stringify(historyResult) }], details: historyResult };
    }
    const result = await originalExecute(id, { action }, signal);
    historyResult = result.details;
    return result;
  };
  const session = await createHelpSession({ pageId: context.pageId, historyTool, activeTool });
  if (!session.model) {
    session.dispose();
    throw new Error("Pi 尚未配置可用模型。");
  }
  // 空会话也保留回退锚点。失败或超时后回到请求前，重试不重复添加用户消息。
  session.sessionManager.appendCustomEntry("product-help-start", {});
  return {
    model: { provider: session.model.provider, id: session.model.id },
    async ask(question, signal, command) {
      if (command?.queryId) historyTool?.selectQuery(command.queryId);
      const checkpoint = session.sessionManager.getLeafId()!;
      const historyCheckpoint = historyTool?.checkpoint();
      historyResult = undefined;
      activeResult = undefined;
      historyCommand = command;
      allowNext = command ? command.action === "next" : /继续|下一页|下一批|更多/.test(question);
      let retrieved: GuideSource[] | undefined;
      const unsubscribe = session.subscribe((event) => {
        if (event.type !== "tool_execution_end" || event.toolName !== "search_product_guide" || event.isError) return;
        const details = event.result.details as GuideToolDetails;
        retrieved = [...(retrieved ?? []), ...details.matches];
      });
      const abort = () => { void session.abort(); };
      signal.addEventListener("abort", abort, { once: true });
      try {
        signal.throwIfAborted();
        await session.prompt(question);
        signal.throwIfAborted();
        const last = session.messages.at(-1);
        if (last?.role === "assistant" && (last.stopReason === "error" || last.stopReason === "aborted")) {
          throw new Error("模型请求未完成。");
        }
        const businessResult = getHistoryResult();
        if (command && !businessResult) throw new Error("本轮未执行请求的历史查询。");
        if (command || (businessResult && !activeResult)) return buildHistoryReply(businessResult!);
        if (activeResult) return buildActiveReply(activeResult);
        return buildGuideReply(session.getLastAssistantText() ?? "", retrieved);
      } catch (error) {
        await session.navigateTree(checkpoint, { summarize: false });
        // 工具主动判定旧快照失效时不复活它；模型失败则回退已推进的正常游标。
        const businessResult = getHistoryResult();
        if (!businessResult || businessResult.status !== "error" || historyTool?.checkpoint()) historyTool?.restore(historyCheckpoint);
        throw error;
      } finally {
        signal.removeEventListener("abort", abort);
        unsubscribe();
      }
    },
    dispose: () => session.dispose(),
  };
}

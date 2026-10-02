import { reactive } from "vue";
import type { AlarmHistoryPage } from "./pageRepository.ts";

export type HelpSource = { source: string; title: string; content: string };
export type HistoryResult = { status: "ready" | "empty" | "done" | "not_published" | "version_changed" | "error"; notice: string; queryId?: string; data?: AlarmHistoryPage };
type Observation = { id: number; value: number; receivedAt: string; sourceTimestamp: string };
export type ActiveSnapshot = {
  pageId: string; version: number; publishedAt: string; queriedAt: string; windowStart: string; staleAfterSeconds: 5;
  status: "ready" | "partial" | "stale" | "no_data" | "unconfigured";
  coverage: { configured: number; observed: number; missing: string[]; stale: { dataKey: string; observation: Observation }[] };
  total: number; omitted: number;
  alarms: { id: string; kind: "threshold" | "fault"; title: string; deviceName: string; dataKey: string;
    threshold?: number; stateCode?: number; unit: string | null; precision: number; freshness: "fresh" | "stale"; observation: Observation }[];
};
export type ActiveResult = { status: ActiveSnapshot["status"] | "not_published"; notice: string; queryId?: string; data?: ActiveSnapshot };
type Message = { id: string; role: "user" | "assistant"; text: string; sources?: HelpSource[]; history?: HistoryResult; active?: ActiveResult };
type Question = { requestId: string; question: string; historyCommand?: { action: "start" | "next"; queryId?: string }; targetId?: string; activeTargetId?: string; expectsActive?: boolean };

// 模块级内存支持路由往返和关闭重开，刷新会重新初始化；不写持久化存储。
export const productHelp = reactive({
  open: false,
  messages: [] as Message[],
  draft: "",
  pending: false,
  error: "",
  expired: false,
  pageId: "",
  pageName: "",
  pageVersion: null as number | null,
  queryingHistory: false,
  queryingActive: false,
});
let generation = 0;
let sessionId: string | null = null;
let lastRequest: Question | null = null;

function validHistory(value: HistoryResult, pageId: string): boolean {
  if (!value || !["ready", "empty", "done", "not_published", "version_changed", "error"].includes(value.status) || typeof value.notice !== "string") return false;
  const data = value.data;
  if (!data) return value.status !== "ready" && value.status !== "empty";
  const observation = (item: any) => item && Number.isInteger(item.id) && item.id > 0 && Number.isFinite(item.value)
    && typeof item.receivedAt === "string" && Number.isFinite(Date.parse(item.receivedAt));
  return data.pageId === pageId && Number.isInteger(data.version) && data.version > 0 && Number.isInteger(data.total) && data.total >= 0
    && typeof value.queryId === "string" && Number.isFinite(Date.parse(data.windowStart)) && Number.isFinite(Date.parse(data.windowEnd))
    && Array.isArray(data.records) && data.records.length <= 20
    && data.records.every((record) => record && typeof record.id === "string" && typeof record.title === "string"
      && typeof record.deviceName === "string" && typeof record.dataKey === "string" && ["threshold", "fault"].includes(record.kind)
      && Number.isInteger(record.precision) && record.precision >= 0 && record.precision <= 20
      && Number.isFinite(Date.parse(record.triggeredAt)) && Number.isFinite(Date.parse(record.recoveredAt))
      && observation(record.trigger?.from) && observation(record.trigger?.to) && observation(record.recovery?.from) && observation(record.recovery?.to));
}

/** 活动快照整体替换，不接受错误页或不完整结构，也不把缺数解释为零告警。 */
function validActive(value: ActiveResult, pageId: string): boolean {
  if (!value || typeof value.notice !== "string") return false;
  const data = value.data;
  if (!data) return value.status === "not_published";
  const coverage = data.coverage;
  const observation = (item: Observation) => item && Number.isInteger(item.id) && item.id > 0 && Number.isFinite(item.value)
    && typeof item.sourceTimestamp === "string" && Number.isFinite(Date.parse(item.receivedAt));
  if (data.pageId !== pageId || !Number.isInteger(data.version) || data.version < 1 || data.status !== value.status
    || !["ready", "partial", "stale", "no_data", "unconfigured"].includes(data.status) || typeof value.queryId !== "string"
    || ![data.publishedAt, data.queriedAt, data.windowStart].every(time => typeof time === "string" && Number.isFinite(Date.parse(time)))
    || data.staleAfterSeconds !== 5 || !Number.isInteger(data.total) || data.total < 0
    || data.omitted !== Math.max(data.total - 20, 0) || !coverage || !Number.isInteger(coverage.configured)
    || !Number.isInteger(coverage.observed) || coverage.observed < 0 || !Array.isArray(coverage.missing)
    || !coverage.missing.every(key => typeof key === "string") || !Array.isArray(coverage.stale)
    || !coverage.stale.every(item => typeof item.dataKey === "string" && observation(item.observation))
    || coverage.configured !== coverage.observed + coverage.missing.length || coverage.stale.length > coverage.observed
    || !Array.isArray(data.alarms) || data.alarms.length !== Math.min(data.total, 20)) return false;
  const expectedStatus = coverage.configured === 0 ? "unconfigured" : coverage.observed === 0 ? "no_data"
    : coverage.missing.length ? "partial" : coverage.stale.length ? "stale" : "ready";
  return data.status === expectedStatus && new Set(data.alarms.map(item => item.id)).size === data.alarms.length
    && data.alarms.every(item => item && typeof item.id === "string" && typeof item.title === "string"
      && typeof item.deviceName === "string" && typeof item.dataKey === "string" && ["threshold", "fault"].includes(item.kind)
      && ["fresh", "stale"].includes(item.freshness) && Number.isInteger(item.precision) && item.precision >= 0 && item.precision <= 20
      && observation(item.observation) && (item.kind === "fault" ? item.stateCode === 2 && item.observation.value === 2
        : typeof item.threshold === "number" && item.observation.value >= item.threshold));
}

class HelpError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

async function post(path: string, body: unknown): Promise<any> {
  let response: Response;
  try {
    response = await fetch(`/api/help${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Industrial-Help": "1" },
      body: JSON.stringify(body),
      // 服务端 60 秒终止；客户端稍晚停止等待，网络失败后仍用同一编号重试。
      signal: AbortSignal.timeout(70_000),
    });
  } catch {
    throw new HelpError("NETWORK_ERROR", "暂时无法连接问答服务，请确认 pnpm dev:agent 已启动后重试。");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new HelpError(data?.error?.code ?? "REQUEST_FAILED", data?.error?.message ?? "本次问答失败，请重试。");
  if (!data) throw new HelpError("INVALID_RESPONSE", "问答服务返回了无法读取的结果，请重试。");
  return data;
}

async function ask(request: Question, retry: boolean): Promise<void> {
  if (productHelp.pending || productHelp.expired) return;
  const currentGeneration = generation;
  const boundPage = productHelp.pageId;
  productHelp.error = "";
  productHelp.pending = true;
  productHelp.queryingHistory = !!request.historyCommand || /历史|已恢复|告警记录/.test(request.question);
  productHelp.queryingActive = !!request.expectsActive || (!productHelp.queryingHistory && /活动告警|当前.*告警/.test(request.question));
  lastRequest = request;
  if (!retry && !request.targetId && !request.activeTargetId) {
    productHelp.messages.push({ id: request.requestId, role: "user", text: request.question });
    productHelp.draft = "";
  }
  try {
    if (window.industrialDesktop) throw new HelpError("DESKTOP_NOT_SUPPORTED", "本版使用帮助仅支持本机网页；Electron 的安全接入尚未启用。");
    if (!sessionId) {
      const created = await post("/sessions", boundPage ? { pageId: boundPage } : {});
      if (currentGeneration !== generation) return;
      if (typeof created.sessionId !== "string") throw new HelpError("INVALID_RESPONSE", "会话初始化失败，请重试。");
      sessionId = created.sessionId;
    }
    const currentSessionId = sessionId;
    if (!currentSessionId) throw new HelpError("INVALID_RESPONSE", "会话初始化失败，请重试。");
    const { targetId, activeTargetId, expectsActive, ...payload } = request;
    const result = await post(`/sessions/${encodeURIComponent(currentSessionId)}/questions`, payload);
    if (currentGeneration !== generation) return;
    if (result.requestId !== request.requestId || typeof result.answer !== "string" || !Array.isArray(result.sources)
      || !result.sources.every((source: HelpSource) => source && typeof source.source === "string" && typeof source.title === "string" && typeof source.content === "string")) {
      throw new HelpError("INVALID_RESPONSE", "问答结果不符合格式，请重试。");
    }
    const history = result.history as HistoryResult | undefined;
    const active = result.active as ActiveResult | undefined;
    if (expectsActive && !active) throw new HelpError("INVALID_RESPONSE", "本次未获得新的活动告警快照，请重试。");
    if (active && !validActive(active, boundPage)) throw new HelpError("INVALID_RESPONSE", "活动告警结果不符合当前页面或资料合同。");
    if (active?.data) productHelp.pageVersion = Math.max(productHelp.pageVersion ?? 0, active.data.version);
    if (request.historyCommand && !history) throw new HelpError("INVALID_RESPONSE", "本次未获得可核对的历史结果，请重试。");
    if (history?.status === "version_changed") {
      productHelp.pageVersion = null;
      productHelp.messages.forEach((message) => { if (message.history?.data) message.history.status = "version_changed"; });
    }
    if (history?.status === "not_published" && productHelp.pageVersion === null) productHelp.pageVersion = 0;
    if (history && !validHistory(history, boundPage)) {
      throw new HelpError("INVALID_RESPONSE", "历史结果不符合当前页面或分页合同。");
    }
    if (history?.data) productHelp.pageVersion = Math.max(productHelp.pageVersion ?? 0, history.data.version);
    if (targetId) {
      const target = productHelp.messages.find((message) => message.id === targetId);
      if (!target?.history?.data) throw new HelpError("INVALID_RESPONSE", "原查询已失效，请重新查询。");
      if (history?.status === "version_changed") target.history.status = "version_changed";
      else if (history?.status === "done") target.history.data.nextOffset = null;
      else if (history?.data && history.queryId === target.history.queryId && history.data.version === target.history.data.version
        && history.data.windowEnd === target.history.data.windowEnd && history.data.windowStart === target.history.data.windowStart
        && history.data.total === target.history.data.total
        && !history.data.records.some((record) => target.history!.data!.records.some((old) => old.id === record.id))) {
        target.history.data.records.push(...history.data.records);
        target.history.data.nextOffset = history.data.nextOffset;
      } else throw new HelpError("INVALID_RESPONSE", "查询快照已变化，不能混用分页，请重新查询。");
    }
    // 仅作为文本渲染，不执行模型生成的 HTML；引用展示在下方的真实来源卡片中。
    const answer = result.answer.replace(/【来源：[^】]+】/g, "").replace(/\*\*([^*]+)\*\*/g, "$1").trim();
    if (activeTargetId) {
      const target = productHelp.messages.find(message => message.id === activeTargetId);
      if (!target?.active || !active) throw new HelpError("INVALID_RESPONSE", "原活动查询已失效，请重新提问。");
      // 新快照替换旧快照；失败在此之前返回，旧观测不会被清空或拼进新结果。
      target.active = active; target.sources = result.sources;
      target.text = active.data ? "查询结果对应以下服务器观测快照：" : answer;
    }
    if (!targetId && !activeTargetId) productHelp.messages.push({ id: `${request.requestId}-answer`, role: "assistant",
      text: active?.data ? "查询结果对应以下服务器观测快照：" : history?.data ? "查询范围已限定为当前页面及发布版本。以下为接口返回的历史记录：" : answer,
      sources: result.sources, history, active });
    lastRequest = null;
  } catch (error) {
    if (currentGeneration !== generation) return;
    if (error instanceof HelpError && error.code === "SESSION_EXPIRED") productHelp.expired = true;
    else productHelp.error = error instanceof Error ? error.message : "本次问答失败，请重试。";
  } finally {
    if (currentGeneration === generation) productHelp.pending = false;
  }
}

export function sendHelp(question: string): Promise<void> {
  const text = question.trim();
  if (!text) return Promise.resolve();
  if (text.length > 1000) { productHelp.error = "问题不能超过 1000 字。"; return Promise.resolve(); }
  return ask({ requestId: crypto.randomUUID(), question: text }, false);
}

export function retryHelp(): Promise<void> {
  return lastRequest ? ask(lastRequest, true) : Promise.resolve();
}

export function queryHelpHistory(): Promise<void> {
  return ask({ requestId: crypto.randomUUID(), question: "查询当前页面最近24小时的已恢复历史告警", historyCommand: { action: "start" } }, false);
}

export function queryHelpActive(): Promise<void> {
  return ask({ requestId: crypto.randomUUID(), question: "查询当前页面活动告警及数据是否过期", expectsActive: true }, false);
}

export function refreshHelpActive(messageId: string): Promise<void> {
  if (!productHelp.messages.find(message => message.id === messageId)?.active) return Promise.resolve();
  return ask({ requestId: crypto.randomUUID(), question: "重新查询当前页面活动告警及数据是否过期", expectsActive: true, activeTargetId: messageId }, false);
}

export function startNewHelpSession(): void {
  if (productHelp.pending) return;
  sessionId = null;
  lastRequest = null;
  productHelp.messages = [];
  productHelp.draft = "";
  productHelp.error = "";
  productHelp.expired = false;
  productHelp.queryingHistory = false;
  productHelp.queryingActive = false;
}

export function bindHelpPage(pageId: string, pageName = pageId): void {
  productHelp.pageName = pageName;
  if (productHelp.pageId === pageId) return;
  generation++;
  productHelp.pending = false;
  startNewHelpSession();
  productHelp.pageId = pageId;
  productHelp.pageVersion = null;
}

export function moreHelpHistory(messageId: string): Promise<void> {
  const message = productHelp.messages.find((item) => item.id === messageId);
  const history = message?.history;
  if (!history?.data || !history.queryId || history.status === "version_changed"
    || history.data.nextOffset === null || (productHelp.pageVersion !== null && history.data.version !== productHelp.pageVersion)) return Promise.resolve();
  return ask({ requestId: crypto.randomUUID(), question: "继续查看历史告警下一批", targetId: messageId,
    historyCommand: { action: "next", queryId: history.queryId } }, false);
}

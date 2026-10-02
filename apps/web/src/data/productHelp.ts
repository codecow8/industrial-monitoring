import { reactive } from "vue";

export type HelpSource = { source: string; title: string; content: string };
type Message = { id: string; role: "user" | "assistant"; text: string; sources?: HelpSource[] };
type Question = { requestId: string; question: string };

// 模块级内存支持路由往返和关闭重开，刷新会重新初始化；不写持久化存储。
export const productHelp = reactive({
  open: false,
  messages: [] as Message[],
  draft: "",
  pending: false,
  error: "",
  expired: false,
});
let sessionId: string | null = null;
let lastRequest: Question | null = null;

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
  productHelp.error = "";
  productHelp.pending = true;
  lastRequest = request;
  if (!retry) {
    productHelp.messages.push({ id: request.requestId, role: "user", text: request.question });
    productHelp.draft = "";
  }
  try {
    if (window.industrialDesktop) throw new HelpError("DESKTOP_NOT_SUPPORTED", "本版使用帮助仅支持本机网页；Electron 的安全接入尚未启用。");
    if (!sessionId) {
      const created = await post("/sessions", {});
      if (typeof created.sessionId !== "string") throw new HelpError("INVALID_RESPONSE", "会话初始化失败，请重试。");
      sessionId = created.sessionId;
    }
    const currentSessionId = sessionId;
    if (!currentSessionId) throw new HelpError("INVALID_RESPONSE", "会话初始化失败，请重试。");
    const result = await post(`/sessions/${encodeURIComponent(currentSessionId)}/questions`, request);
    if (result.requestId !== request.requestId || typeof result.answer !== "string" || !Array.isArray(result.sources)
      || !result.sources.every((source: HelpSource) => source && typeof source.source === "string" && typeof source.title === "string" && typeof source.content === "string")) {
      throw new HelpError("INVALID_RESPONSE", "问答结果不符合格式，请重试。");
    }
    // 仅作为文本渲染，不执行模型生成的 HTML；引用展示在下方的真实来源卡片中。
    const answer = result.answer.replace(/【来源：[^】]+】/g, "").replace(/\*\*([^*]+)\*\*/g, "$1").trim();
    productHelp.messages.push({ id: `${request.requestId}-answer`, role: "assistant", text: answer, sources: result.sources });
    lastRequest = null;
  } catch (error) {
    if (error instanceof HelpError && error.code === "SESSION_EXPIRED") productHelp.expired = true;
    else productHelp.error = error instanceof Error ? error.message : "本次问答失败，请重试。";
  } finally {
    productHelp.pending = false;
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

export function startNewHelpSession(): void {
  if (productHelp.pending) return;
  sessionId = null;
  lastRequest = null;
  productHelp.messages = [];
  productHelp.draft = "";
  productHelp.error = "";
  productHelp.expired = false;
}

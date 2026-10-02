import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { Type } from "typebox";
import { Value } from "typebox/value";
import { createHelpConversation, type HelpConversation, type HelpReply } from "./conversation.ts";

const uuidPattern = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";
const requestSchema = Type.Object({
  requestId: Type.String({ pattern: uuidPattern }),
  question: Type.String({ minLength: 1, maxLength: 1000, pattern: "\\S" }),
}, { additionalProperties: false });
const origins = new Set(["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173", "http://127.0.0.1:4173", "http://localhost:4174", "http://127.0.0.1:4174"]);
type Outcome = { status: number; body: unknown };
type RequestRecord = { question: string; result?: HelpReply };
type Entry = {
  conversation: HelpConversation;
  lastUsed: number;
  requests: Map<string, RequestRecord>;
  active?: { id: string; controller: AbortController; response: Promise<Outcome> };
};
class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const failure = (status: number, code: string, message: string): Outcome => ({ status, body: { error: { code, message } } });

/** 有界读取，拒绝任意大请求；不把客户端输入或模型错误写入日志。 */
function readBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0, exceeded = false;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 8192) {
        exceeded = true;
        chunks.length = 0;
        reject(new HttpError(413, "BODY_TOO_LARGE", "请求体不能超过 8 KB。"));
      } else if (!exceeded) chunks.push(chunk);
    });
    request.on("end", () => {
      if (exceeded) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(new HttpError(400, "INVALID_JSON", "请发送有效 JSON。")); }
    });
    request.on("error", reject);
  });
}

/** 注入会话工厂和时钟仅用于接口测试；线上固定 15 分钟闲置、60 秒超时。 */
export function createHelpHttpServer(options: {
  createConversation?: () => Promise<HelpConversation>;
  now?: () => number;
  idleMs?: number;
  timeoutMs?: number;
} = {}) {
  const factory = options.createConversation ?? createHelpConversation;
  const now = options.now ?? Date.now;
  const idleMs = options.idleMs ?? 15 * 60_000;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const entries = new Map<string, Entry>();
  let creating = 0;
  const sweep = () => {
    for (const [id, entry] of entries) {
      if (!entry.active && now() - entry.lastUsed >= idleMs) {
        entry.conversation.dispose();
        entries.delete(id);
      }
    }
  };
  const cleanupTimer = setInterval(sweep, 30_000);
  cleanupTimer.unref();

  const ask = (entry: Entry, requestId: string, question: string): Promise<Outcome> => {
    const existing = entry.requests.get(requestId);
    if (existing && existing.question !== question) throw new HttpError(409, "REQUEST_ID_CONFLICT", "同一请求编号不能用于不同问题。");
    if (existing?.result) return Promise.resolve({ status: 200, body: { requestId, ...existing.result } });
    if (entry.active) {
      if (entry.active.id === requestId) return entry.active.response;
      throw new HttpError(409, "SESSION_BUSY", "当前会话正在回答，请等待后再提问。");
    }
    if (!existing && entry.requests.size >= 100) throw new HttpError(429, "SESSION_LIMIT", "当前会话已达到问题上限，请刷新开始新会话。");
    const record = existing ?? { question };
    entry.requests.set(requestId, record);
    const controller = new AbortController();
    let respond!: (outcome: Outcome) => void;
    const response = new Promise<Outcome>((resolve) => { respond = resolve; });
    entry.active = { id: requestId, controller, response };
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
      respond(failure(504, "MODEL_TIMEOUT", "问答超过 60 秒，请重试这条问题。"));
      // 超时不提前释放会话：SDK 确认终止后才能重试，避免两个模型调用同时修改上下文。
    }, timeoutMs);
    const finish = (result?: HelpReply) => {
      clearTimeout(timeout);
      entry.active = undefined;
      entry.lastUsed = now();
      if (timedOut) return; // 晚到的结果不缓存，也不冒充超时请求成功。
      if (result) {
        record.result = result;
        respond({ status: 200, body: { requestId, ...result } });
      } else respond(failure(502, "MODEL_ERROR", "本次未能生成可核对的回答，请重试这条问题。"));
    };
    Promise.resolve().then(() => entry.conversation.ask(question, controller.signal)).then(
      (result) => finish(result), () => finish(),
    );
    return response;
  };

  const server = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    const send = (outcome: Outcome) => {
      if (response.destroyed) return; // 浏览器关闭不取消已接受的问答，仍可按编号取回结果。
      response.writeHead(outcome.status);
      response.end(JSON.stringify(outcome.body));
    };
    try {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      // 同时防 DNS rebinding 和跨站调用本机个人 Pi。CORS 不是多人鉴权。
      if (!["127.0.0.1:" + port, "localhost:" + port].includes(request.headers.host ?? "")) {
        throw new HttpError(403, "FORBIDDEN_HOST", "只接受本机地址。");
      }
      const origin = request.headers.origin;
      if (origin && !origins.has(origin)) throw new HttpError(403, "FORBIDDEN_ORIGIN", "不允许此网页调用本机问答服务。");
      if (origin) {
        response.setHeader("Access-Control-Allow-Origin", origin);
        response.setHeader("Vary", "Origin");
      }
      if (request.method === "OPTIONS" && origin) {
        response.setHeader("Access-Control-Allow-Methods", "POST");
        response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Industrial-Help");
        response.writeHead(204).end();
        return;
      }
      if (request.headers["x-industrial-help"] !== "1") throw new HttpError(403, "MISSING_CLIENT_HEADER", "缺少问答客户端标识。");
      if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED", "仅支持 POST 请求。");
      if (request.headers["content-type"]?.split(";")[0].trim() !== "application/json") throw new HttpError(415, "INVALID_CONTENT_TYPE", "请使用 application/json。");
      const body = await readBody(request);
      sweep();
      if (request.url === "/api/help/sessions") {
        if (!Value.Check(Type.Object({}, { additionalProperties: false }), body)) throw new HttpError(400, "INVALID_INPUT", "创建会话无需额外参数。");
        if (entries.size + creating >= 20) throw new HttpError(429, "TOO_MANY_SESSIONS", "本机会话数量已达到上限，请等待闲置会话清理。");
        creating++;
        let conversation: HelpConversation;
        try { conversation = await factory(); }
        finally { creating--; }
        const sessionId = randomUUID();
        entries.set(sessionId, { conversation, lastUsed: now(), requests: new Map() });
        send({ status: 201, body: { sessionId, idleTimeoutSeconds: 900 } });
        return;
      }
      const route = /^\/api\/help\/sessions\/([0-9a-f-]{36})\/questions$/.exec(request.url ?? "");
      if (!route || !new RegExp(uuidPattern).test(route[1])) throw new HttpError(404, "NOT_FOUND", "接口不存在。");
      if (!Value.Check(requestSchema, body)) throw new HttpError(400, "INVALID_INPUT", "需要有效请求编号及 1–1000 字的非空问题。");
      const entry = entries.get(route[1]);
      if (!entry) throw new HttpError(410, "SESSION_EXPIRED", "会话已过期，请开始新会话；之前的对话不会恢复。");
      entry.lastUsed = now();
      const { requestId, question } = body as { requestId: string; question: string };
      send(await ask(entry, requestId, question.trim()));
    } catch (error) {
      send(error instanceof HttpError ? failure(error.status, error.code, error.message)
        : failure(503, "SERVICE_UNAVAILABLE", "问答服务暂不可用，请检查本机 Pi 配置后重试。"));
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.on("close", () => {
    clearInterval(cleanupTimer);
    for (const entry of entries.values()) {
      entry.active?.controller.abort();
      entry.conversation.dispose();
    }
    entries.clear();
  });
  return server;
}

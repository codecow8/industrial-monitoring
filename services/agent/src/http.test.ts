import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { test, type TestContext } from "node:test";
import { createHelpHttpServer } from "./http.ts";
import type { HelpReply } from "./conversation.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function start(t: TestContext, options: Parameters<typeof createHelpHttpServer>[0] = {}) {
  const server = createHelpHttpServer({
    createConversation: async () => ({ ask: async () => ({ answer: "完成", sources: [] }), dispose() {} }),
    ...options,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  const post = async (path: string, body: unknown, headers: Record<string, string> = {}) => {
    const response = await fetch(base + path, { method: "POST", headers: {
      "Content-Type": "application/json", "X-Industrial-Help": "1", ...headers,
    }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() as any, headers: response.headers };
  };
  const session = async () => {
    const response = await post("/api/help/sessions", {});
    assert.equal(response.status, 201);
    return response.body.sessionId as string;
  };
  return { post, session, base };
}

test("两个标签页会话相互隔离，完整结果按请求编号缓存", async (t) => {
  const histories: string[][] = [];
  const api = await start(t, { createConversation: async () => {
    const history: string[] = [];
    histories.push(history);
    return { ask: async (question) => { history.push(question); return { answer: history.join(" → "), sources: [] }; }, dispose() {} };
  } });
  const one = await api.session(), two = await api.session();
  assert.notEqual(one, two);
  const path = `/api/help/sessions/${one}/questions`, requestId = randomUUID();
  const first = await api.post(path, { requestId, question: "怎样发布？" });
  const duplicate = await api.post(path, { requestId, question: "怎样发布？" });
  assert.equal(first.status, 200);
  assert.deepEqual(duplicate.body, first.body);
  const follow = await api.post(path, { requestId: randomUUID(), question: "哪里查看？" });
  assert.equal(follow.body.answer, "怎样发布？ → 哪里查看？");
  const other = await api.post(`/api/help/sessions/${two}/questions`, { requestId: randomUUID(), question: "数据键？" });
  assert.equal(other.body.answer, "数据键？");
  assert.deepEqual(histories, [["怎样发布？", "哪里查看？"], ["数据键？"]]);
});

test("并发重复请求共用一次生成，其他问题和请求编号冲突返回 409", async (t) => {
  const started = deferred<void>(), answer = deferred<HelpReply>();
  let calls = 0;
  const api = await start(t, { createConversation: async () => ({
    ask: async () => { calls++; started.resolve(); return answer.promise; }, dispose() {},
  }) });
  const id = await api.session(), path = `/api/help/sessions/${id}/questions`, requestId = randomUUID();
  const first = api.post(path, { requestId, question: "发布" });
  await started.promise;
  const duplicate = api.post(path, { requestId, question: "发布" });
  assert.equal((await api.post(path, { requestId: randomUUID(), question: "绑定" })).body.error.code, "SESSION_BUSY");
  assert.equal((await api.post(path, { requestId, question: "其他问题" })).body.error.code, "REQUEST_ID_CONFLICT");
  answer.resolve({ answer: "完成", sources: [] });
  assert.deepEqual((await duplicate).body, (await first).body);
  assert.equal(calls, 1);
});

test("闲置会话过期，清理资源，返回 410 而非恢复旧对话", async (t) => {
  let clock = 0, disposed = 0;
  const api = await start(t, { now: () => clock, idleMs: 50, createConversation: async () => ({
    ask: async () => ({ answer: "完成", sources: [] }), dispose: () => { disposed++; },
  }) });
  const id = await api.session();
  clock = 51;
  const result = await api.post(`/api/help/sessions/${id}/questions`, { requestId: randomUUID(), question: "发布" });
  assert.equal(result.status, 410);
  assert.equal(result.body.error.code, "SESSION_EXPIRED");
  assert.equal(disposed, 1);
  assert.notEqual(await api.session(), id);
});

test("失败可用原请求编号重试，错误响应不泄漏供应商细节", async (t) => {
  let calls = 0;
  const api = await start(t, { createConversation: async () => ({
    ask: async () => { if (++calls === 1) throw new Error("private credential detail"); return { answer: "恢复", sources: [] }; }, dispose() {},
  }) });
  const id = await api.session(), path = `/api/help/sessions/${id}/questions`;
  const body = { requestId: randomUUID(), question: "发布" };
  const failed = await api.post(path, body);
  assert.equal(failed.status, 502);
  assert.ok(!JSON.stringify(failed.body).includes("private credential"));
  assert.equal((await api.post(path, body)).body.answer, "恢复");
  assert.equal(calls, 2);
});

test("超时发出终止信号，终止完成前不允许新生成，晚到结果不缓存", async (t) => {
  const late = deferred<HelpReply>(), aborted = deferred<void>();
  let calls = 0;
  const api = await start(t, { timeoutMs: 30, createConversation: async () => ({
    ask: async (_question, signal) => {
      if (++calls > 1) return { answer: "重试成功", sources: [] };
      signal.addEventListener("abort", () => aborted.resolve(), { once: true });
      return late.promise;
    }, dispose() {},
  }) });
  const id = await api.session(), path = `/api/help/sessions/${id}/questions`, body = { requestId: randomUUID(), question: "发布" };
  assert.equal((await api.post(path, body)).status, 504);
  await aborted.promise;
  assert.equal((await api.post(path, { requestId: randomUUID(), question: "绑定" })).status, 409);
  assert.equal((await api.post(path, body)).status, 504);
  late.resolve({ answer: "不应该缓存", sources: [] });
  // 等待可控模型 Promise 结算，不用固定延迟猜测。
  await late.promise;
  await new Promise<void>((resolve) => setImmediate(resolve));
  const retried = await api.post(path, body);
  assert.equal(retried.body.answer, "重试成功");
  assert.equal(calls, 2);
});

test("拦截跨站、错误 Host、缺少客户端标识及非法输入", async (t) => {
  const api = await start(t);
  assert.equal((await api.post("/api/help/sessions", {}, { Origin: "https://evil.example" })).status, 403);
  // fetch 会重写 Host；用真实 HTTP 请求确认服务器确实收到伪造的 Host。
  const wrongHostStatus = await new Promise<number>((resolve, reject) => {
    const request = httpRequest(api.base + "/api/help/sessions", { method: "POST", headers: {
      Host: "evil.example", "Content-Type": "application/json", "X-Industrial-Help": "1",
    } }, (response) => { response.resume(); response.on("end", () => resolve(response.statusCode!)); });
    request.on("error", reject);
    request.end("{}");
  });
  assert.equal(wrongHostStatus, 403);
  assert.equal((await api.post("/api/help/sessions", {}, { "X-Industrial-Help": "" })).status, 403);
  const allowed = await api.post("/api/help/sessions", {}, { Origin: "http://localhost:5173" });
  assert.equal(allowed.headers.get("Access-Control-Allow-Origin"), "http://localhost:5173");
  const id = await api.session(), path = `/api/help/sessions/${id}/questions`;
  for (const question of ["", " \n ", "字".repeat(1001), 1]) {
    assert.equal((await api.post(path, { requestId: randomUUID(), question })).status, 400);
  }
  assert.equal((await api.post(path, { requestId: "bad", question: "发布" })).status, 400);
  assert.equal((await api.post(path, { requestId: randomUUID(), question: "发布", filePath: "/etc/passwd" })).status, 400);
  assert.equal((await api.post(path, { requestId: randomUUID(), question: "字".repeat(4000) })).status, 413);
  const preflight = await fetch(api.base + path, { method: "OPTIONS", headers: { Origin: "http://localhost:5173" } });
  assert.equal(preflight.status, 204);
});

import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { productHelp, retryHelp, sendHelp, startNewHelpSession } from "../src/data/productHelp.ts";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
Object.assign(globalThis, { window: {} });
after(() => { globalThis.fetch = originalFetch; Object.assign(globalThis, { window: originalWindow }); });
beforeEach(() => { startNewHelpSession(); productHelp.open = false; });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("按接口合同发送请求、保留会话和来源，重试使用原编号且不重复用户消息", async () => {
  const requests: Array<{ path: string; body: any }> = [];
  let questionCalls = 0;
  globalThis.fetch = async (url, init) => {
    assert.equal((init?.headers as Record<string, string>)["X-Industrial-Help"], "1");
    const body = JSON.parse(init?.body as string);
    requests.push({ path: String(url), body });
    if (String(url).endsWith("/sessions")) return json({ sessionId: "one" });
    if (++questionCalls === 1) return json({ error: { code: "MODEL_ERROR", message: "暂时失败" } }, 502);
    return json({ requestId: body.requestId, answer: "点击**发布版本**。【来源：docs/product-guide.md · 发布】", sources: [{ source: "docs/product-guide.md", title: "发布", content: "操作原文" }] });
  };
  await sendHelp("怎样发布？");
  assert.equal(productHelp.error, "暂时失败");
  await retryHelp();
  assert.equal(productHelp.messages.length, 2);
  assert.equal(productHelp.messages[1].text, "点击发布版本。");
  assert.equal(productHelp.messages[1].sources?.[0].content, "操作原文");
  assert.equal(requests[1].body.requestId, requests[2].body.requestId);
  productHelp.open = false;
  productHelp.open = true;
  await sendHelp("哪里查看？");
  assert.equal(requests.filter((request) => request.path.endsWith("/sessions")).length, 1);
  assert.notEqual(requests[3].body.requestId, requests[2].body.requestId);
});

test("生成中禁止重复发送，关闭不取消请求", async () => {
  let finish!: (response: Response) => void;
  let calls = 0, requestId = "";
  const started = Promise.withResolvers<void>();
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/sessions")) return json({ sessionId: "two" });
    calls++;
    requestId = JSON.parse(init?.body as string).requestId;
    started.resolve();
    return new Promise<Response>((resolve) => { finish = resolve; });
  };
  const first = sendHelp("发布");
  await started.promise;
  productHelp.open = false;
  await sendHelp("重复");
  assert.equal(calls, 1);
  assert.equal(productHelp.pending, true);
  finish(json({ requestId, answer: "完成", sources: [] }));
  await first;
  assert.equal(productHelp.pending, false);
  assert.equal(productHelp.messages.length, 2);
});

test("过期保留旧消息并阻止追问，必须主动清空开始新会话", async () => {
  let created = 0, questionCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/sessions")) return json({ sessionId: `session-${++created}` });
    questionCalls++;
    return json({ error: { code: "SESSION_EXPIRED", message: "已过期" } }, 410);
  };
  await sendHelp("发布");
  assert.equal(productHelp.expired, true);
  assert.equal(productHelp.messages.length, 1);
  await retryHelp();
  await sendHelp("追问");
  assert.equal(questionCalls, 1);
  productHelp.draft = "未发送内容";
  startNewHelpSession();
  assert.equal(productHelp.expired, false);
  assert.deepEqual(productHelp.messages, []);
  assert.equal(productHelp.draft, "");
  await sendHelp("新问题背景");
  assert.equal(created, 2);
});

test("网络失败可重试，不假装成功，不接受无关请求编号的返回", async () => {
  globalThis.fetch = async () => { throw new Error("connection refused"); };
  await sendHelp("发布");
  assert.ok(productHelp.error.includes("暂时无法连接"));
  assert.equal(productHelp.messages.length, 1);
  globalThis.fetch = async (url) => String(url).endsWith("/sessions") ? json({ sessionId: "three" }) : json({ requestId: "wrong", answer: "伪造成功", sources: [] });
  await retryHelp();
  assert.equal(productHelp.messages.length, 1);
  assert.ok(productHelp.error.includes("不符合格式"));
});

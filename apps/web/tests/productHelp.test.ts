import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { productHelp, retryHelp, sendHelp, startNewHelpSession, bindHelpPage, moreHelpHistory, queryHelpHistory, queryHelpActive, refreshHelpActive } from "../src/data/productHelp.ts";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
Object.assign(globalThis, { window: {} });
after(() => { globalThis.fetch = originalFetch; Object.assign(globalThis, { window: originalWindow }); });
beforeEach(() => { bindHelpPage(""); startNewHelpSession(); productHelp.open = false; });
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

function historyPage(offset = 0) {
  const observation = (id: number, value: number) => ({ id, value, receivedAt: "2026-10-02T10:00:00Z", sourceTimestamp: "2026-10-02T10:00:00Z" });
  return { pageId: "demo", version: 1, windowStart: "2026-10-02T08:00:00Z", windowEnd: "2026-10-02T11:00:00Z", total: 21, nextOffset: offset ? null : 20,
    records: Array.from({length: offset ? 1 : 20}, (_, index) => ({ id: `record-${index + offset}`, kind: "threshold", title: "温度越界", deviceName: "泵", dataKey: "pump.temp", unit: "°C", precision: 1,
      triggeredAt: "2026-10-02T10:00:00Z", recoveredAt: "2026-10-02T10:00:00Z",
      trigger: { from: observation(index + 100, 70), to: observation(index + 101, 83) }, recovery: { from: observation(index + 102, 83), to: observation(index + 103, 70) },
    })) };
}

test("绑定当前页，分页携带明确查询编号并合并20+1，不重复问题", async () => {
  bindHelpPage("demo", "冷却系统");
  const queryId = crypto.randomUUID();
  const requests: any[] = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init?.body as string); requests.push(body);
    if (String(url).endsWith("/sessions")) { assert.equal(body.pageId, "demo"); return json({ sessionId: "bound" }); }
    const offset = body.historyCommand?.action === "next" ? 20 : 0;
    return json({ requestId: body.requestId, answer: "记录", sources: [], history: { status: "ready", notice: "真实记录", queryId, data: historyPage(offset) } });
  };
  await queryHelpHistory();
  assert.equal(productHelp.messages.length, 2);
  const id = productHelp.messages[1].id;
  await moreHelpHistory(id);
  assert.equal(productHelp.messages.length, 2);
  assert.equal(productHelp.messages[1].history?.data?.records.length, 21);
  assert.equal(requests[2].historyCommand.queryId, queryId);
  assert.equal(requests[2].historyCommand.action, "next");
  assert.equal("targetId" in requests[2], false);
});

test("切换页面后丢弃旧会话的迟到回答，新会话绑定新页面", async () => {
  bindHelpPage("one");
  const started = Promise.withResolvers<void>(), late = Promise.withResolvers<Response>();
  let oldId = "";
  const pages: string[] = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init?.body as string);
    if (String(url).endsWith("/sessions")) { pages.push(body.pageId); return json({ sessionId: body.pageId }); }
    if (String(url).includes("/one/")) { oldId = body.requestId; started.resolve(); return late.promise; }
    return json({ requestId: body.requestId, answer: "新页面回答", sources: [] });
  };
  const old = sendHelp("旧问题");
  await started.promise;
  bindHelpPage("two");
  await sendHelp("新问题");
  late.resolve(json({ requestId: oldId, answer: "旧页面迟到回答", sources: [] }));
  await old;
  assert.deepEqual(pages, ["one", "two"]);
  assert.equal(productHelp.messages.length, 2);
  assert.equal(productHelp.messages[1].text, "新页面回答");
  assert.equal(productHelp.pending, false);
});

test("版本变化不追加或继续旧数据，分页失败重试保留编号", async () => {
  bindHelpPage("demo");
  const queryId = crypto.randomUUID();
  let calls = 0;
  const ids: string[] = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init?.body as string);
    if (String(url).endsWith("/sessions")) return json({ sessionId: "one" });
    ids.push(body.requestId);
    if (++calls === 2) return json({ error: { code: "MODEL_ERROR", message: "查询失败" } }, 502);
    return json({ requestId: body.requestId, answer: "记录", sources: [], history: calls === 1
      ? { status: "ready", notice: "记录", queryId, data: historyPage() }
      : { status: "version_changed", notice: "发布版本已变化" } });
  };
  await queryHelpHistory();
  const id = productHelp.messages[1].id;
  await moreHelpHistory(id);
  assert.equal(productHelp.messages[1].history?.data?.records.length, 20);
  await retryHelp();
  assert.equal(ids[1], ids[2]);
  assert.equal(productHelp.messages[1].history?.status, "version_changed");
  await moreHelpHistory(id);
  assert.equal(calls, 3);
});

function activePage(id = 101, value = 83) {
  return { pageId: "demo", version: 1, publishedAt: "2026-10-02T09:00:00Z", queriedAt: "2026-10-02T10:00:01Z",
    windowStart: "2026-10-02T09:00:00Z", staleAfterSeconds: 5, status: "ready",
    coverage: { configured: 1, observed: 1, missing: [], stale: [] }, total: 1, omitted: 0,
    alarms: [{ id: "threshold:pump.temp:80", kind: "threshold", title: "温度越界", dataKey: "pump.temp", deviceName: "泵",
      threshold: 80, unit: "°C", precision: 1, freshness: "fresh", observation: { id, value, receivedAt: "2026-10-02T10:00:00Z", sourceTimestamp: "device-time" } }] };
}

test("活动重新查询替换快照不追加记录，失败保留旧结果，重试沿用编号", async () => {
  bindHelpPage("demo");
  const ids: string[] = [];
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init?.body as string);
    if (String(url).endsWith("/sessions")) return json({ sessionId: "active" });
    ids.push(body.requestId);
    if (++calls === 2) return json({ error: { code: "MODEL_ERROR", message: "本次查询失败" } }, 502);
    const active = { status: "ready", notice: "本次快照", queryId: crypto.randomUUID(), data: activePage(calls === 1 ? 101 : 102) };
    return json({ requestId: body.requestId, answer: "来源可靠", sources: [], active });
  };
  await queryHelpActive();
  const id = productHelp.messages[1].id;
  assert.equal(productHelp.messages[1].active?.data?.alarms[0].observation.id, 101);
  await refreshHelpActive(id);
  assert.equal(productHelp.messages[1].active?.data?.alarms[0].observation.id, 101);
  assert.equal(productHelp.error, "本次查询失败");
  await retryHelp();
  assert.equal(ids[1], ids[2]);
  assert.equal(productHelp.messages.length, 2);
  assert.equal(productHelp.messages[1].active?.data?.alarms[0].observation.id, 102);
});

test("活动无数据保留资料不足状态，拒绝错误页或伪装正常的响应", async () => {
  bindHelpPage("demo");
  const data = { ...activePage(), status: "no_data", total: 0, alarms: [], coverage: { configured: 1, observed: 0, missing: ["pump.temp"], stale: [] } };
  globalThis.fetch = async (url, init) => String(url).endsWith("/sessions") ? json({ sessionId: "missing" })
    : json({ requestId: JSON.parse(init?.body as string).requestId, answer: "没有资料", sources: [], active: { status: "no_data", queryId: "q1", notice: "无法判断", data } });
  await queryHelpActive();
  assert.equal(productHelp.messages[1].active?.status, "no_data");
  assert.deepEqual(productHelp.messages[1].active?.data?.coverage.missing, ["pump.temp"]);

  for (const invalid of [{ ...data, pageId: "other" }, { ...data, status: "ready" }]) {
    startNewHelpSession();
    globalThis.fetch = async (url, init) => String(url).endsWith("/sessions") ? json({ sessionId: "invalid" })
      : json({ requestId: JSON.parse(init?.body as string).requestId, answer: "正常", sources: [], active: { status: invalid.status, queryId: "q2", notice: "正常", data: invalid } });
    await queryHelpActive();
    assert.equal(productHelp.messages.length, 1);
    assert.ok(productHelp.error.includes("资料合同"));
  }
});

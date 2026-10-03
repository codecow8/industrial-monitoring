import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { request } from "node:http";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import { createHelpHttpServer } from "../src/http.ts";
import { createHelpConversation, type HelpReply } from "../src/conversation.ts";
import type { ActiveAlarmSnapshot } from "../src/active-alarms.ts";
import { checkActiveReply, type ActiveExpectation, type EvalObservation } from "./active-checks.ts";

// 普通测试只加载判定器；显式启用此入口才会创建资料或调用真实 Pi 模型。
if (process.env.LIVE_ACTIVE_EVAL !== "1") throw new Error("请设置 LIVE_ACTIVE_EVAL=1 后运行四例真实活动告警评测。");
const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
const directory = fileURLToPath(new URL("../../../.scratch/active-alarm-evals/runs/", import.meta.url));
await mkdir(directory, { recursive: true });
const reportPath = `${directory}${runId}.jsonl`;
const record = async (event: object) => {
  const line = JSON.stringify(event);
  await appendFile(reportPath, line + "\n");
  console.log(line);
};
await appendFile(reportPath, JSON.stringify({ type: "run", runId, startedAt: new Date().toISOString(),
  scope: "four-active-cases", semanticReview: "pending", transport: "real Pi through local HTTP" }) + "\n", { flag: "wx" });
console.log(`首次结果保存到 ${reportPath}`);

/** 本机业务和帮助请求直接走 Node HTTP，避免环境代理截走 127.0.0.1。 */
async function jsonRequest<T>(port: number, path: string, method = "GET", body?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path, method, headers: {
      "Content-Type": "application/json", "X-Industrial-Help": "1",
    } }, response => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { text += chunk; });
      response.on("error", reject);
      response.on("end", () => {
        if (!response.statusCode || response.statusCode >= 400) return reject(new Error(`HTTP ${response.statusCode}: ${text}`));
        try { resolve(JSON.parse(text) as T); } catch (error) { reject(error); }
      });
    });
    req.setTimeout(port === 8000 ? 10_000 : 75_000, () => req.destroy(new Error("评测请求超时")));
    req.on("error", reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

const dispatcher = new EnvHttpProxyAgent();
setGlobalDispatcher(dispatcher);
const models = new Map<string, { provider: string; id: string }>();
// 使用生产 HTTP / 会话代码，仅端口独立；不更改服务超时、工具或模型偏好。
const server = createHelpHttpServer({ createConversation: async context => {
  const conversation = await createHelpConversation(context);
  if (!conversation.model) { conversation.dispose(); throw new Error("实际 Pi 模型元数据缺失"); }
  models.set(context.pageId!, conversation.model);
  return conversation;
} });
interface Fixture { pageId: string; keys: [string, string]; sessionId: string }
let failed = 0;
let passed = 0;
let previousQueryId: string | undefined;
let alarmFixture: Fixture | undefined;
try {
  await jsonRequest(8000, "/api/health");
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const helpPort = address.port;
  const postValues = (fixture: Fixture, values: number[]) => jsonRequest(8000, "/api/telemetry", "POST", {
    // 设备时间刻意很旧，不能据此把刚收到的服务器观测判为过期。
    timestamp: "2000-01-01T00:00:00Z",
    values: Object.fromEntries(values.map((value, index) => [fixture.keys[index], value])),
  });
  async function prepare(id: string): Promise<Fixture> {
    const pageId = `active-eval-${runId}-${id}`;
    const keys: [string, string] = [`${pageId}.temperature`, `${pageId}.state`];
    const schema = { version: "1.0.0", id: pageId, name: "活动告警固定评测", canvas: { width: 1440, height: 900, background: "#0e1d2b" },
      components: [
        { id: "temperature", type: "metric-card", position: { x: 455, y: 250 }, size: { width: 300, height: 214 },
          props: { deviceName: "评测泵", title: "出口温度", dataKey: keys[0], unit: "°C", precision: 1, alarmThreshold: 80 } },
        { id: "state", type: "device-state", position: { x: 780, y: 250 }, size: { width: 300, height: 180 },
          props: { deviceName: "评测泵", title: "运行状态", dataKey: keys[1] } },
      ] };
    await jsonRequest(8000, `/api/pages/${pageId}/draft`, "PUT", schema);
    await jsonRequest(8000, `/api/pages/${pageId}/publish`, "POST");
    const created = await jsonRequest<{ sessionId: string }>(helpPort, "/api/help/sessions", "POST", { pageId });
    return { pageId, keys, sessionId: created.sessionId };
  }
  async function expectation(fixture: Fixture, values: number[]): Promise<ActiveExpectation> {
    const reference = await jsonRequest<ActiveAlarmSnapshot>(8000, `/api/pages/${fixture.pageId}/active-alarms`);
    assert.equal(reference.pageId, fixture.pageId);
    assert.equal(reference.version, 1);
    assert.equal(reference.total, values.length === 2 && values[0] === 83 ? 2 : 0);
    assert.equal(reference.coverage.configured, 2);
    assert.equal(reference.coverage.observed, values.length);
    assert.deepEqual(reference.coverage.missing, values.length === 1 ? [fixture.keys[1]] : []);
    // 证据 API 可取得 fresh 正常值的实际 ID，活动列表本身不会展示这些观测。
    const observations: EvalObservation[] = [];
    for (const [index, value] of values.entries()) {
      const params = new URLSearchParams({ kind: index ? "fault" : "threshold", dataKey: fixture.keys[index],
        start: reference.publishedAt, end: reference.queriedAt, ...(!index ? { threshold: "80" } : {}) });
      const evidence = await jsonRequest<{ pageId: string; version: number; observations: EvalObservation[] }>(8000,
        `/api/pages/${fixture.pageId}/alarm-evidence?${params}`);
      assert.equal(evidence.pageId, fixture.pageId);
      assert.equal(evidence.version, 1);
      const observation = evidence.observations.at(-1);
      assert.ok(observation);
      assert.equal(observation.dataKey, fixture.keys[index]);
      assert.equal(observation.value, value);
      observations.push(observation);
    }
    return { reference, observations };
  }
  const cases = [
    { id: "A1", question: "当前页面有哪些活动告警？" },
    { id: "A2", question: "现在都正常了吗？请查询当前页面活动告警，核对资料是否完整。" },
    { id: "A3", question: "现在有哪些告警？请查询当前页面活动告警，并核对数据是否过期。" },
    { id: "A4", question: "重新查询当前页面活动告警。" },
  ];
  for (const item of cases) {
    const started = performance.now();
    const requestId = randomUUID(); // 每问新编号，不能让 HTTP 幂等缓存冒充重新查询。
    let fixture: Fixture | undefined;
    let expected: ActiveExpectation | undefined;
    try {
      fixture = item.id === "A4" ? alarmFixture : await prepare(item.id);
      assert.ok(fixture, "过期告警案例未能建立，恢复案例缺少同会话基线");
      const values = item.id === "A2" ? [72] : item.id === "A4" ? [72, 1] : [83, 2];
      await postValues(fixture, values);
      if (item.id === "A3") { alarmFixture = fixture; await delay(5200); }
      expected = await expectation(fixture, values);
      if (item.id === "A4") {
        assert.ok(previousQueryId, "上一轮未返回活动查询，无法验证同会话替换");
        expected.previousQueryId = previousQueryId;
      }
      await record({ type: "case-start", ...item, pageId: fixture.pageId, sessionId: fixture.sessionId,
        requestId, model: models.get(fixture.pageId), expected });
      const reply = await jsonRequest<HelpReply & { requestId: string }>(helpPort,
        `/api/help/sessions/${fixture.sessionId}/questions`, "POST", { requestId, question: item.question });
      const failures = checkActiveReply(reply, expected);
      if (reply.requestId !== requestId) failures.push("HTTP 响应请求编号不正确");
      if (item.id === "A3") previousQueryId = reply.active?.queryId;
      if (failures.length) failed++; else passed++;
      await record({ type: "case-result", ...item, requestId, pageId: fixture.pageId, model: models.get(fixture.pageId),
        elapsedMs: Math.round(performance.now() - started), passed: !failures.length, failures,
        semanticReview: "pending", reply });
    } catch (error) {
      failed++;
      await record({ type: "case-result", ...item, requestId, pageId: fixture?.pageId,
        model: fixture ? models.get(fixture.pageId) : undefined, elapsedMs: Math.round(performance.now() - started),
        passed: false, failures: [error instanceof Error ? error.message : "评测失败"], semanticReview: "not-reviewed" });
    }
  }
  await record({ type: "summary", passed, failed, total: cases.length, completedAt: new Date().toISOString(),
    semanticReview: "pending", reportPath });
  process.exitCode = failed ? 1 : 0;
} catch (error) {
  await record({ type: "setup-failure", error: error instanceof Error ? error.message : "初始化失败" });
  process.exitCode = 1;
} finally {
  if (server.listening) await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
  await dispatcher.close();
}

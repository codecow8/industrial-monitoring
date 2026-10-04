import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, test } from "../auth-fixtures";

const preflightOnly = process.env.DEFAULT_HELP_PREFLIGHT_ONLY === "1";
test.skip(!preflightOnly && process.env.LIVE_DEFAULT_HELP_EVAL !== "1", "需显式选择无模型预检或一条真实提问");

test("默认5173 → 8001 → 8000登录帮助链路", async ({ page, request, playwright }) => {
  const runId = randomUUID(), pageId = `default-help-${runId}`;
  const directory = fileURLToPath(new URL("../../.scratch/default-help-chain/runs/", import.meta.url));
  await mkdir(directory, { recursive: true });
  const report = `${directory}${runId}.jsonl`, screenshot = `/tmp/industrial-default-help-${runId}.png`;
  await appendFile(report, JSON.stringify({ type: "run", runId, pageId, preflightOnly,
    startedAt: new Date().toISOString(), baseURL: "http://127.0.0.1:5173", agentPort: 8001, apiPort: 8000 }) + "\n", { flag: "wx" });
  const log = (value: object) => appendFile(report, JSON.stringify(value) + "\n");
  let questions = 0, sessionId: string | undefined, reply: any, model: object | undefined;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("request", call => { if (/\/api\/help\/sessions\/[^/]+\/questions$/.test(new URL(call.url()).pathname)) questions++; });
  const started = performance.now();
  try {
    // newContext也会继承测试配置，必须显式覆盖登录storageState。
    const anonymous = await playwright.request.newContext({ baseURL: "http://127.0.0.1:5173", storageState: { cookies: [], origins: [] } });
    try {
      const denied = await anonymous.post("/api/help/sessions", { headers: { "X-Industrial-Help": "1" }, data: {} });
      expect(denied.status()).toBe(401);
      expect((await denied.json()).error.code).toBe("LOGIN_REQUIRED");
    } finally { await anonymous.dispose(); }
    expect((await request.get("/api/auth/me")).status()).toBe(200);
    const temperature = `${pageId}.temperature`, state = `${pageId}.state`;
    const schema = { version: "1.0.0", id: pageId, name: "默认帮助链路验收", canvas: { width: 1440, height: 900, background: "#0e1d2b" },
      components: [
        { id: "metric", type: "metric-card", position: { x: 275, y: 130 }, size: { width: 300, height: 214 },
          props: { deviceName: "验收泵", title: "出口温度", dataKey: temperature, unit: "°C", precision: 1, alarmThreshold: 80 } },
        { id: "state", type: "device-state", position: { x: 610, y: 130 }, size: { width: 300, height: 180 },
          props: { deviceName: "验收泵", title: "运行状态", dataKey: state } },
      ] };
    expect((await request.put(`/api/pages/${pageId}/draft`, { data: schema })).status()).toBe(200);
    expect((await request.post(`/api/pages/${pageId}/publish`)).status()).toBe(200);
    expect((await request.post("/api/telemetry", { data: { timestamp: "2000-01-01T00:00:00Z",
      values: { [temperature]: 83, [state]: 2 } } })).status()).toBe(202);
    const expected = await (await request.get(`/api/pages/${pageId}/active-alarms`)).json();
    expect(expected.total).toBe(2);
    // 只初始化会话，没有用户问题和模型生成；同时验证默认代理的登录转发。
    const initialized = await request.post("/api/help/sessions", { headers: { "X-Industrial-Help": "1" }, data: { pageId } });
    expect(initialized.status()).toBe(201);
    await page.goto(`/runtime/${pageId}`);
    await expect(page).toHaveURL(`http://127.0.0.1:5173/runtime/${pageId}`);
    await expect(page.getByText("实时数据已连接", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "退出登录" })).toHaveCount(0);
    await page.getByRole("button", { name: "使用帮助", exact: true }).click();
    const panel = page.getByTestId("help-panel");
    await expect(panel).toContainText("当前画面 v1");
    await log({ type: "preflight", passed: true, anonymousStatus: 401, sessionStatus: 201, expected, questions });
    if (preflightOnly) {
      expect(questions).toBe(0);
      await log({ type: "result", passed: true, questions, elapsedMs: Math.round(performance.now() - started) });
      return;
    }
    const logFile = process.env.DEFAULT_HELP_LOG_FILE;
    if (!logFile) throw new Error("需提供默认Agent服务日志以核对实际模型，尚未发送问题");
    // 只监听真实网络响应；没有page.route、随机帮助服务器或回复替身。
    const createdResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/help/sessions");
    const answerResponse = page.waitForResponse(response => /\/api\/help\/sessions\/[^/]+\/questions$/.test(new URL(response.url()).pathname), { timeout: 75_000 });
    const question = "当前页面有哪些活动告警？请核对观测来源。";
    await log({ type: "case-start", question });
    await panel.getByLabel("你的问题").fill(question);
    await panel.getByRole("button", { name: "发送", exact: true }).click();
    const created = await createdResponse;
    expect(created.status()).toBe(201);
    sessionId = (await created.json()).sessionId;
    const answered = await answerResponse;
    reply = await answered.json();
    // 首次HTTP结果先追加保存，再判定，失败也不丢失实际回复。
    await log({ type: "http-result", status: answered.status(), sessionId, reply });
    expect(answered.status()).toBe(200);
    const entry = (await readFile(logFile, "utf8")).split("\n").flatMap(line => {
      try { return [JSON.parse(line)]; } catch { return []; }
    }).find(item => item.type === "help-session-created" && item.sessionId === sessionId);
    expect(entry?.provider).toBeTruthy(); expect(entry?.id).toBeTruthy();
    model = { provider: entry.provider, id: entry.id };
    expect(questions).toBe(1);
    const data = reply.active.data;
    expect(data.pageId).toBe(pageId); expect(data.version).toBe(1); expect(data.total).toBe(2);
    expect(["ready", "stale"]).toContain(data.status);
    expect(data.alarms.map((alarm: any) => alarm.observation.id)).toEqual(expected.alarms.map((alarm: any) => alarm.observation.id));
    for (const alarm of data.alarms) {
      const stale = Date.parse(data.queriedAt) - Date.parse(alarm.observation.receivedAt) >= 5000;
      expect(alarm.freshness).toBe(stale ? "stale" : "fresh");
      expect(reply.sources.some((source: any) => source.source === `observation:${alarm.observation.id}`)).toBe(true);
    }
    expect(data.coverage.stale.length).toBe(data.alarms.filter((alarm: any) => alarm.freshness === "stale").length);
    await expect(panel.getByRole("region", { name: "当前活动告警查询结果" })).toBeVisible();
    await panel.getByText("查看来源依据", { exact: true }).first().click();
    await expect(panel).toContainText(`观测 #${expected.alarms[0].observation.id}`);
    await expect(panel).toContainText("以服务器观测时间为准");
    expect(errors).toEqual([]);
    await page.screenshot({ path: screenshot });
    await log({ type: "result", passed: true, model, sessionId, questions,
      elapsedMs: Math.round(performance.now() - started), screenshot, semanticReview: "pending" });
  } catch (error) {
    await page.screenshot({ path: screenshot }).catch(() => {});
    await log({ type: "result", passed: false, model, sessionId, questions,
      elapsedMs: Math.round(performance.now() - started), screenshot,
      error: error instanceof Error ? error.message : "默认链路失败" });
    throw error;
  }
});

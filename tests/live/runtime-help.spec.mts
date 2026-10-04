import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { expect, test } from "../auth-fixtures";
import { createHelpHttpServer } from "../../services/agent/src/http.ts";
import { createHelpConversation } from "../../services/agent/src/conversation.ts";

// 不加入普通浏览器验收；显式开关后只发送一条真实模型问题，不自动重试。
test.skip(process.env.LIVE_RUNTIME_HELP_EVAL !== "1", "显式设置 LIVE_RUNTIME_HELP_EVAL=1 才调用真实模型");
test.setTimeout(120_000);

test("已登录运行态使用真实 Pi 查询活动告警并展开观测来源", async ({ page, request }) => {
  const runId = randomUUID();
  const pageId = `runtime-help-live-${runId}`;
  const directory = fileURLToPath(new URL("../../.scratch/runtime-help-agent/live/", import.meta.url));
  await mkdir(directory, { recursive: true });
  const report = `${directory}${runId}.jsonl`;
  await appendFile(report, JSON.stringify({ type: "run", runId, pageId, startedAt: new Date().toISOString(),
    scope: "one real Pi question through authenticated runtime browser" }) + "\n", { flag: "wx" });
  const log = (value: object) => appendFile(report, JSON.stringify(value) + "\n");
  const requireAgent = createRequire(fileURLToPath(new URL("../../services/agent/package.json", import.meta.url)));
  const { EnvHttpProxyAgent, setGlobalDispatcher } = requireAgent("undici");
  const dispatcher = new EnvHttpProxyAgent();
  setGlobalDispatcher(dispatcher);
  let model: { provider: string; id: string } | undefined;
  let reply: any;
  let questions = 0;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const server = createHelpHttpServer({ createConversation: async context => {
    const conversation = await createHelpConversation(context);
    model = conversation.model; // 实际会话模型；不记录偏好文件、Cookie或凭据。
    return conversation;
  } });
  const started = performance.now();
  try {
    const temperature = `${pageId}.temperature`, state = `${pageId}.state`;
    const schema = { version: "1.0.0", id: pageId, name: "运行态 Pi 验收", canvas: { width: 1440, height: 900, background: "#0e1d2b" },
      components: [
        { id: "metric", type: "metric-card", position: { x: 275, y: 130 }, size: { width: 300, height: 214 },
          props: { deviceName: "验收泵", title: "出口温度", dataKey: temperature, unit: "°C", precision: 1, alarmThreshold: 80 } },
        { id: "state", type: "device-state", position: { x: 610, y: 130 }, size: { width: 300, height: 180 },
          props: { deviceName: "验收泵", title: "运行状态", dataKey: state } },
      ] };
    expect((await request.put(`/api/pages/${pageId}/draft`, { data: schema })).ok()).toBe(true);
    expect((await request.post(`/api/pages/${pageId}/publish`)).ok()).toBe(true);
    expect((await request.post("/api/telemetry", { data: { timestamp: "2000-01-01T00:00:00Z",
      values: { [temperature]: 83, [state]: 2 } } })).status()).toBe(202);
    const expected = await (await request.get(`/api/pages/${pageId}/active-alarms`)).json();
    expect(expected.total).toBe(2);
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    if (!address || typeof address !== "object") throw new Error("测试帮助端口未就绪");
    // 独立端口复用生产认证、HTTP、会话和工具。测试代理不重启用户的 8001 服务。
    await page.route("**/api/help/**", async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/questions")) questions++;
      const headers = await route.request().allHeaders();
      const response = await route.fetch({ timeout: 75_000, url: `http://127.0.0.1:${address.port}${path}`,
        headers: { ...headers, host: `127.0.0.1:${address.port}` } });
      if (path.endsWith("/questions")) reply = await response.json();
      await route.fulfill({ response });
    });
    await page.goto(`/runtime/${pageId}`);
    await expect(page.getByRole("button", { name: "退出登录" })).toHaveCount(0);
    await page.getByRole("button", { name: "使用帮助", exact: true }).click();
    const panel = page.getByTestId("help-panel");
    await expect(panel).toContainText("当前画面 v1");
    const question = "当前页面有哪些活动告警？请核对观测来源。";
    await log({ type: "case-start", question, expected });
    await panel.getByLabel("你的问题").fill(question);
    await panel.getByRole("button", { name: "发送", exact: true }).click();
    await expect(panel.getByRole("region", { name: "当前活动告警查询结果" })).toBeVisible({ timeout: 75_000 });
    expect(model?.provider).toBeTruthy();
    expect(model?.id).toBeTruthy();
    expect(questions).toBe(1);
    expect(reply.active.data.pageId).toBe(pageId);
    expect(reply.active.data.version).toBe(1);
    expect(reply.active.data.total).toBe(2);
    expect(reply.active.data.alarms.map((alarm: any) => alarm.observation.id)).toEqual(expected.alarms.map((alarm: any) => alarm.observation.id));
    await panel.getByText("查看来源依据", { exact: true }).first().click();
    await expect(panel).toContainText(`观测 #${expected.alarms[0].observation.id}`);
    await expect(panel).toContainText("以服务器观测时间为准");
    expect(errors).toEqual([]);
    await page.screenshot({ path: "/tmp/industrial-runtime-help-live.png" });
    await log({ type: "result", passed: true, model, questions, elapsedMs: Math.round(performance.now() - started),
      reply, screenshot: "/tmp/industrial-runtime-help-live.png", semanticReview: "pending" });
  } catch (error) {
    await log({ type: "result", passed: false, model, questions, elapsedMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : "真实流程失败", reply });
    throw error;
  } finally {
    if (server.listening) await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
    await dispatcher.close();
  }
});

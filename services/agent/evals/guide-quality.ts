import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadGuide } from "../src/guide.ts";
import { createEvalLogin } from "./platform-login.ts";
import { checkGuideReply, selectGuideCases } from "./guide-checks.ts";

// 独立显式入口，默认三题、可明确选择单题；普通test只运行离线判定器。
if (process.env.LIVE_GUIDE_QUALITY_EVAL !== "1") throw new Error("请显式设置 LIVE_GUIDE_QUALITY_EVAL=1。");
const cases = selectGuideCases(process.argv.slice(2));
const modelLog = process.env.GUIDE_QUALITY_LOG_FILE;
if (!modelLog) throw new Error("需指定当前默认Agent服务日志以核对实际模型。");
await readFile(modelLog, "utf8"); // 调用模型前确认日志可读，不能拿配置偏好代替实际会话。
const guide = await loadGuide(fileURLToPath(new URL("../../../docs/product-guide.md", import.meta.url)));
const runId = randomUUID();
const directory = fileURLToPath(new URL("../../../.scratch/guide-quality/runs/", import.meta.url));
await mkdir(directory, { recursive: true });
const report = `${directory}${runId}.jsonl`;
await appendFile(report, JSON.stringify({ type: "run", runId, startedAt: new Date().toISOString(),
  endpoint: "http://127.0.0.1:8001", cases: cases.map(item => item.id), pageBound: false }) + "\n", { flag: "wx" });
const log = (value: object) => appendFile(report, JSON.stringify(value) + "\n");
const login = await createEvalLogin();
let questions = 0, failures = 0;
async function post(path: string, body: unknown) {
  const response = await fetch(`http://127.0.0.1:8001/api/help${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Industrial-Help": "1", Cookie: login.cookie },
    body: JSON.stringify(body), signal: AbortSignal.timeout(75_000),
  });
  return { status: response.status, body: await response.json() };
}
try {
  for (const item of cases) {
    const started = performance.now(), requestId = randomUUID();
    let sessionId: string | undefined, model: { provider: string; id: string } | undefined;
    await log({ type: "case-start", id: item.id, requestId, question: item.question, expectedChapter: item.chapter, facts: item.facts });
    try {
      const created = await post("/sessions", {});
      if (created.status !== 201 || typeof created.body.sessionId !== "string") throw new Error("会话创建失败，未提问。");
      sessionId = created.body.sessionId;
      const entry = (await readFile(modelLog, "utf8")).split("\n").flatMap(line => {
        try { return [JSON.parse(line)]; } catch { return []; }
      }).find(value => value.type === "help-session-created" && value.sessionId === sessionId);
      if (typeof entry?.provider !== "string" || typeof entry?.id !== "string") throw new Error("实际会话模型日志缺失，未提问。");
      model = { provider: entry.provider, id: entry.id };
      questions++;
      const response = await post(`/sessions/${sessionId}/questions`, { requestId, question: item.question });
      const errors = response.status === 200 ? checkGuideReply(response.body, requestId, item.chapter, guide) : [`帮助HTTP状态${response.status}`];
      if (errors.length) failures++;
      await log({ type: "result", id: item.id, sessionId, requestId, model, status: response.status,
        elapsedMs: Math.round(performance.now() - started), structuralPassed: errors.length === 0,
        errors, reply: response.body, semanticReview: "pending" });
      console.log(JSON.stringify({ id: item.id, structuralPassed: errors.length === 0, errors }));
    } catch {
      failures++;
      // 不记录网络异常中的请求头或凭据，不重试；其他已批准题各执行一次。
      await log({ type: "result", id: item.id, sessionId, requestId, model,
        elapsedMs: Math.round(performance.now() - started), structuralPassed: false,
        errors: ["案例请求或记录失败，未自动重试"], semanticReview: "pending" });
    }
  }
  await log({ type: "run-end", questions, structuralFailures: failures });
  console.log(JSON.stringify({ report, questions, structuralFailures: failures, semanticReview: "pending" }));
  process.exitCode = failures ? 1 : 0;
} finally { login.dispose(); }

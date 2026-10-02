import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { loadGuide } from "../src/guide.ts";
import type { HelpReply } from "../src/conversation.ts";

// 显式启用才调用真实模型；不加入普通 test，避免每次开发都消耗模型额度。
if (process.env.LIVE_HELP_EVAL !== "1") throw new Error("请设置 LIVE_HELP_EVAL=1 后运行真实问答验收。");
const cases = [
  ["Q1", "保存草稿后，运行态为什么还是旧内容？"],
  ["Q3", "点击预览运行态会自动发布吗？"],
  ["Q4", "怎样添加温度折线图？能添加第二个吗？"],
  ["Q5", "数据键是什么？出口温度应该怎样设置？"],
  ["Q6", "页面显示“尚未发布”，应该怎么办？"],
  ["Q10", "点击“指标卡”为什么没增加一个组件？"],
  ["Q11", "怎样添加“冷却系统运行概览”标题？"],
  ["Q12", "页面发布了，为什么温度还没有数据？"],
  ["Q13", "现在有哪些活动告警？"],
];
const guide = await loadGuide(fileURLToPath(new URL("../../../docs/product-guide.md", import.meta.url)));
async function post(path: string, body: unknown) {
  const response = await fetch(`http://127.0.0.1:8001/api/help${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Industrial-Help": "1" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(75_000),
  });
  return { status: response.status, body: await response.json() };
}

let failures = 0;
const selected = process.argv.slice(2);
if (selected.some((id) => !cases.some(([known]) => known === id))) throw new Error("指定了未定义的案例编号。");
for (const [id, question] of cases.filter(([id]) => !selected.length || selected.includes(id))) {
  // 普通案例各用新会话，避免前一题的答案代替本题检索；Q7 已另行验证连续会话。
  const created = await post("/sessions", {});
  if (created.status !== 201) throw new Error(`会话创建失败：${JSON.stringify(created.body)}`);
  const response = await post(`/sessions/${created.body.sessionId}/questions`, { requestId: randomUUID(), question });
  if (response.status !== 200) {
    failures++;
    console.log(JSON.stringify({ id, question, status: response.status, error: response.body }));
    continue;
  }
  const reply = response.body as HelpReply;
  // 此检查只验证来源存在且正文未被替换，不能替代对回答关键事实的人工评审。
  const sourcesValid = reply.sources.length > 0 && reply.sources.every((source) =>
    source.source === "docs/product-guide.md" && guide.some((chapter) => chapter.title === source.title && chapter.content === source.content));
  if (!sourcesValid) failures++;
  console.log(JSON.stringify({ id, question, sourcesValid, answer: reply.answer, sources: reply.sources.map((source) => source.title) }));
}
process.exitCode = failures ? 1 : 0;

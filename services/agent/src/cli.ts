import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import { createHelpSession } from "./session.ts";

// SDK 不会执行 Pi CLI 的网络初始化；显式沿用环境代理，避免导入后变成直连。
// 只影响当前 Node 进程，不硬编码代理地址、不修改系统或用户配置。
const dispatcher = new EnvHttpProxyAgent();
setGlobalDispatcher(dispatcher);
const session = await createHelpSession();
const input = createInterface({ input: stdin, output: stdout });
try {
  if (!session.model) throw new Error("未找到可用模型，请先在 Pi 中配置模型并登录。");
  console.log(`产品使用帮助 · ${session.model.provider}/${session.model.id}`);
  console.log("输入问题，/exit 退出；本次聊天不保存，重新启动会清空。\n");

  // prompt 等待当前轮结束后才接收下一问，连续问题复用同一份内存上下文。
  const unsubscribe = session.subscribe((event) => {
    if (event.type === "tool_execution_start") console.log("[检索产品指南]");
  });
  try {
    while (true) {
      let query: string;
      try {
        query = (await input.question("你：")).trim();
      } catch {
        break; // Ctrl+D 关闭输入时正常结束。
      }
      if (query === "/exit") break;
      if (!query) continue;
      try {
        await session.prompt(query);
        const last = session.messages.at(-1);
        if (last?.role === "assistant" && (last.stopReason === "error" || last.stopReason === "aborted")) {
          throw new Error(last.errorMessage ?? "模型请求未完成。");
        }
        const answer = session.getLastAssistantText();
        if (!answer) throw new Error("模型没有返回回答，请检查 Pi 登录和模型配置。");
        console.log(`\n助手：${answer}\n`);
      } catch (error) {
        console.error(`问答失败：${error instanceof Error ? error.message : "未知错误"}`);
      }
    }
  } finally {
    unsubscribe();
  }
} finally {
  input.close();
  session.dispose();
  await dispatcher.close();
}

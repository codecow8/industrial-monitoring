import { createHelpSession } from "./session.ts";
import type { GuideToolDetails } from "./guide-tool.ts";

export interface GuideSource {
  source: string;
  title: string;
  content: string;
}
export interface HelpReply {
  answer: string;
  sources: GuideSource[];
}
export interface HelpConversation {
  ask(question: string, signal: AbortSignal): Promise<HelpReply>;
  dispose(): void;
}

/** 只返回本轮工具实际检索到、且模型实际引用的章节；不信任模型生成的来源正文。 */
export function buildGuideReply(answer: string, retrieved: GuideSource[] | undefined): HelpReply {
  if (!retrieved) throw new Error("模型未调用指南检索工具。");
  if (retrieved.length === 0) return {
    answer: "操作指南中未检索到相关资料，暂时无法给出有依据的操作步骤。请补充问题或相关文档。",
    sources: [],
  };
  const titles = [...answer.matchAll(/【来源：([^】]+)】/g)].map((match) => {
    const citation = /^docs\/product-guide\.md\s*·\s*(.+)$/.exec(match[1].trim());
    if (!citation) throw new Error("回答引用了未授权的资料来源。");
    return citation[1].trim();
  });
  if (!answer.trim() || titles.length === 0) throw new Error("回答缺少指南来源。");
  const sources = [...new Set(titles)].map((title) => {
    const source = retrieved.find((item) => item.title === title);
    if (!source) throw new Error("回答引用了本轮未检索到的章节。");
    return source;
  });
  return { answer, sources };
}

export async function createHelpConversation(): Promise<HelpConversation> {
  const session = await createHelpSession();
  if (!session.model) {
    session.dispose();
    throw new Error("Pi 尚未配置可用模型。");
  }
  // 空会话也保留回退锚点。失败或超时后回到请求前，重试不重复添加用户消息。
  session.sessionManager.appendCustomEntry("product-help-start", {});
  return {
    async ask(question, signal) {
      const checkpoint = session.sessionManager.getLeafId()!;
      let retrieved: GuideSource[] | undefined;
      const unsubscribe = session.subscribe((event) => {
        if (event.type !== "tool_execution_end" || event.toolName !== "search_product_guide" || event.isError) return;
        const details = event.result.details as GuideToolDetails;
        retrieved = [...(retrieved ?? []), ...details.matches];
      });
      const abort = () => { void session.abort(); };
      signal.addEventListener("abort", abort, { once: true });
      try {
        signal.throwIfAborted();
        await session.prompt(question);
        signal.throwIfAborted();
        const last = session.messages.at(-1);
        if (last?.role === "assistant" && (last.stopReason === "error" || last.stopReason === "aborted")) {
          throw new Error("模型请求未完成。");
        }
        return buildGuideReply(session.getLastAssistantText() ?? "", retrieved);
      } catch (error) {
        await session.navigateTree(checkpoint, { summarize: false });
        throw error;
      } finally {
        signal.removeEventListener("abort", abort);
        unsubscribe();
      }
    },
    dispose: () => session.dispose(),
  };
}

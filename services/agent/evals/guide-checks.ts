import type { GuideSection } from "../src/guide.ts";

// 事实清单供人工审阅，不能用关键词命中冒充回答语义正确。
export const guideCases = [
  { id: "Q1", question: "保存草稿后，运行态为什么还是旧内容？", chapter: "保存草稿与发布版本",
    facts: ["保存只更新草稿，不创建发布版本", "运行态读取已发布配置", "最新修改需发布成功，已有运行态需刷新"] },
  { id: "Q3", question: "点击预览运行态会自动发布吗？", chapter: "保存草稿与发布版本",
    facts: ["预览先保存，成功后跳转，不自动发布", "已有版本显示旧发布配置", "从未发布显示尚未发布，需返回发布", "保存失败不跳转"] },
  { id: "Q11", question: "怎样添加“冷却系统运行概览”标题？", chapter: "添加组件",
    facts: ["点击文本并填写标题内容", "字号12–64、颜色和左/中/右对齐", "可调整位置尺寸，保存并按需发布", "可以添加多个文本块", "纯文本，不绑定数据，不解析HTML或Markdown"] },
] as const;

/** 明确选择才复测对应题；拒绝未知/重复编号，避免扩大已授权问题数。 */
export function selectGuideCases(ids: string[]) {
  if (new Set(ids).size !== ids.length || ids.some(id => !guideCases.some(item => item.id === id))) {
    throw new Error("指南案例编号未知或重复。");
  }
  return guideCases.filter(item => !ids.length || ids.includes(item.id));
}

/** 只判结构和来源真实性/相关章节；返回空数组仍须人工审阅事实清单。 */
export function checkGuideReply(reply: unknown, requestId: string, chapter: string, guide: GuideSection[]): string[] {
  if (!reply || typeof reply !== "object" || Array.isArray(reply)) return ["回复不是对象"];
  const value = reply as Record<string, unknown>;
  const errors: string[] = [];
  if (value.requestId !== requestId) errors.push("请求编号不符");
  if (typeof value.answer !== "string" || !value.answer.trim()) errors.push("回答为空或格式错误");
  if ("active" in value || "history" in value) errors.push("指南问题混入告警结果");
  if (!Array.isArray(value.sources) || !value.sources.length) return [...errors, "来源为空或格式错误"];
  let relevant = false;
  for (const source of value.sources) {
    if (!source || typeof source !== "object" || source.source !== "docs/product-guide.md"
      || !guide.some(section => section.title === source.title && section.content === source.content)) {
      errors.push("来源路径、章节或正文不属于当前指南");
    } else if (source.title === chapter) relevant = true;
  }
  if (!relevant) errors.push("缺少本题预期章节");
  return errors;
}

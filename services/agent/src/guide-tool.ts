import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { GuideSection } from "./guide.ts";
import { searchGuide } from "./search.ts";

const parameters = Type.Object({
  query: Type.String({
    minLength: 1,
    maxLength: 500,
    pattern: "\\S",
    description: "产品操作问题的检索词；连续追问时结合上下文补全主题。",
  }),
}, { additionalProperties: false });

export interface GuideToolDetails {
  status: "found" | "not_found";
  matches: Array<GuideSection & { source: string }>;
  notice: string;
}

/** 启动时加载好的指南通过闭包传入，模型不能指定路径或读取其他文件。 */
export function createGuideSearchTool(sections: GuideSection[]) {
  return {
    name: "search_product_guide",
    label: "检索产品操作指南",
    description: "只读检索工业监控产品操作指南，返回最多三个候选章节的标题、原文和来源。候选资料可能不足以回答问题；不查询实时数据，不执行配置或发布。",
    parameters,
    execute: async (_toolCallId: string, params: { query: string }) => {
      const matches = searchGuide(sections, params.query).map(({ title, content }) => ({
        source: "docs/product-guide.md",
        title,
        content,
      }));
      const details: GuideToolDetails = {
        status: matches.length ? "found" : "not_found",
        matches,
        notice: matches.length
          ? "候选章节不等于充分依据。仅根据原文回答并引用来源及章节；原文未覆盖时明确说明资料不足。"
          : "没有匹配章节。可改写检索词再尝试；仍无依据时说明资料不足，不编造操作或断言产品一定不支持。",
      };
      return {
        // content 是模型看到的资料，details 保留结构化结果供后续服务和测试使用。
        content: [{ type: "text" as const, text: JSON.stringify(details) }],
        details,
      };
    },
  } satisfies ToolDefinition<typeof parameters, GuideToolDetails>;
}

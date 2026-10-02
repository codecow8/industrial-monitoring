import { readFile } from "node:fs/promises";

/** 一章是第一版检索的基本单位：标题用于定位，正文用于提供回答依据。 */
export interface GuideSection {
  title: string;
  content: string;
}

/** 按当前操作指南的二级标题拆分，不做通用 Markdown 解析。 */
export function splitGuide(markdown: string): GuideSection[] {
  const sections: GuideSection[] = [];
  let current: GuideSection | undefined;

  // 同时接受 LF 和 CRLF；只匹配 "## "，因此三级标题会保留在正文中。
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith("## ")) {
      current = { title: line.slice(3).trim(), content: "" };
      // 开始一章时就加入结果，文件结束时无需另做收尾，最后一章也不会丢失。
      sections.push(current);
    } else if (current) {
      current.content += `${line}\n`;
    }
    // 第一章之前的一级标题和简介不进入章节内容。
  }

  return sections.map((section) => ({ ...section, content: section.content.trim() }));
}

/** 只读加载 UTF-8 指南；路径由调用方提供，读取失败直接交给调用方处理。 */
export async function loadGuide(filePath: string): Promise<GuideSection[]> {
  const markdown = await readFile(filePath, "utf8");
  return splitGuide(markdown);
}

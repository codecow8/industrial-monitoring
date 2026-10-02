import type { GuideSection } from "./guide.ts";

/** 分数只用于排序，不表示答案正确率或资料是否足够。 */
export interface GuideSearchResult extends GuideSection {
  score: number;
}

const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
const questionWords = new Set([
  "怎样", "如何", "怎么", "什么", "为什么", "哪些", "哪里",
  "可以", "是否", "请问", "帮我", "现在", "还是",
]);

function words(text: string): Set<string> {
  // 分词避免将整句中文当成一个关键词；去重避免重复提问放大分数。
  const result = new Set<string>();
  for (const part of segmenter.segment(text.toLowerCase())) {
    const word = part.segment;
    if (!part.isWordLike || questionWords.has(word)) continue;
    // 忽略“的”“吗”等单字；英文词及数据键中的字母、数字仍可匹配。
    if (/^\p{Script=Han}$/u.test(word)) continue;
    result.add(word);
  }
  return result;
}

/** 返回最多三个相关章节，原文交给后续模型引用，不在检索阶段生成答案。 */
export function searchGuide(sections: GuideSection[], query: string): GuideSearchResult[] {
  const queryWords = words(query);

  return sections.map((section) => {
    const titleWords = words(section.title);
    const contentWords = words(section.content);
    let score = 0;
    for (const word of queryWords) {
      // 标题通常更能表明章节主题；正文无论重复多少次，每个词只计一次。
      if (titleWords.has(word)) score += 3;
      if (contentWords.has(word)) score += 1;
    }
    return { ...section, score };
  }).filter((section) => section.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

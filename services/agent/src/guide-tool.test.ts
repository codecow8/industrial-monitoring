import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Value } from "typebox/value";
import { loadGuide } from "./guide.ts";
import { createGuideSearchTool } from "./guide-tool.ts";

const guidePath = fileURLToPath(new URL("../../../docs/product-guide.md", import.meta.url));

test("Pi 工具返回发布操作原文及可核对的指南来源", async () => {
  const tool = createGuideSearchTool(await loadGuide(guidePath));
  const result = await tool.execute("call-1", { query: "怎样保存草稿并发布版本？" });

  assert.equal(result.details.status, "found");
  const first = result.details.matches[0];
  assert.equal(first.source, "docs/product-guide.md");
  assert.equal(first.title, "保存草稿与发布版本");
  assert.ok(first.content.includes("等待出现“已发布 v…”提示"));
  assert.ok(result.details.matches.length <= 3);
  assert.deepEqual(JSON.parse(result.content[0].text), result.details);
  assert.ok(result.details.matches.every((match) => !("score" in match)));
});

test("无匹配时返回空资料并要求说明资料不足，不生成答案", async () => {
  const tool = createGuideSearchTool(await loadGuide(guidePath));
  const result = await tool.execute("call-2", { query: "量子纠缠隐形传态" });

  assert.equal(result.details.status, "not_found");
  assert.deepEqual(result.details.matches, []);
  assert.ok(result.details.notice.includes("资料不足"));
  assert.ok(result.details.notice.includes("不编造"));
});

test("工具参数只允许非空且有长度上限的检索词，不允许任意文件路径", () => {
  const tool = createGuideSearchTool([]);
  assert.equal(Value.Check(tool.parameters, { query: "发布版本" }), true);
  for (const params of [{}, { query: 1 }, { query: "" }, { query: " \n " },
    { query: "字".repeat(501) }, { query: "发布", filePath: "/etc/passwd" }]) {
    assert.equal(Value.Check(tool.parameters, params), false);
  }
});

test("连续调用保持指南原文，通用词命中时仍提示候选不等于充分依据", async () => {
  const sections = await loadGuide(guidePath);
  const original = structuredClone(sections);
  const tool = createGuideSearchTool(sections);
  await tool.execute("call-3", { query: "发布版本" });
  const result = await tool.execute("call-4", { query: "配置 MQTT 设备接入" });

  assert.deepEqual(sections, original);
  assert.equal(result.details.status, "found");
  assert.ok(result.details.notice.includes("不等于充分依据"));
  for (const match of result.details.matches) {
    assert.equal(match.content, original.find((section) => section.title === match.title)?.content);
  }
});

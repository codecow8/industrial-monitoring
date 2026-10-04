import assert from "node:assert/strict";
import { test } from "node:test";
import { checkGuideReply, guideCases, selectGuideCases } from "./guide-checks.ts";

const guide = [{ title: "保存草稿与发布版本", content: "测试发布章节" }, { title: "添加组件", content: "测试组件章节" }];
const reply = (chapter = guide[0]) => ({ requestId: "request-1", answer: "测试回答", sources: [{ source: "docs/product-guide.md", ...chapter }] });

test("单题选择只返回Q11，拒绝未知或重复编号，不扩大复测预算", () => {
  assert.deepEqual(selectGuideCases(["Q11"]).map(item => item.id), ["Q11"]);
  assert.equal(selectGuideCases([]).length, 3);
  assert.throws(() => selectGuideCases(["Q14"]));
  assert.throws(() => selectGuideCases(["Q11", "Q11"]));
});

test("三题接受当前指南的预期章节，判定不依赖回答固定措辞", () => {
  for (const item of guideCases) {
    assert.deepEqual(checkGuideReply(reply(guide.find(section => section.title === item.chapter)!), "request-1", item.chapter, guide), []);
  }
});

test("拒绝真实但不切题的章节和被替换的来源正文/路径", () => {
  for (const value of [reply(guide[1]),
    { ...reply(), sources: [{ source: "other.md", ...guide[0] }] },
    { ...reply(), sources: [{ source: "docs/product-guide.md", title: guide[0].title, content: "被替换的正文" }] },
  ]) assert.ok(checkGuideReply(value, "request-1", guide[0].title, guide).length);
});

test("拒绝错请求、空回答、错误来源格式和混入告警结果", () => {
  for (const value of [null, [], { ...reply(), requestId: "old-request" }, { ...reply(), answer: " " },
    { ...reply(), sources: [] }, { ...reply(), sources: [null] }, { ...reply(), sources: "invalid" },
    { ...reply(), active: {} }, { ...reply(), history: {} },
  ]) assert.ok(checkGuideReply(value, "request-1", guide[0].title, guide).length);
});

test("结构通过不等于语义通过，事实清单由人工审阅", () => {
  assert.deepEqual(checkGuideReply({ ...reply(), answer: "保存草稿会自动发布。" }, "request-1", guide[0].title, guide), []);
  assert.ok(guideCases.every(item => item.facts.length >= 3));
});

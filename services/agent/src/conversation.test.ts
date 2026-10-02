import assert from "node:assert/strict";
import { test } from "node:test";
import { buildGuideReply } from "./conversation.ts";

const source = { source: "docs/product-guide.md", title: "保存草稿与发布版本", content: "点击发布版本，等待已发布提示。" };

test("API 来源正文取自真实检索资料，重复引用去重", () => {
  const citation = "【来源：docs/product-guide.md · 保存草稿与发布版本】";
  const reply = buildGuideReply(`请点击发布版本。${citation}${citation}`, [source]);
  assert.deepEqual(reply.sources, [source]);
});

test("拒绝未调用工具、缺少引用和引用未检索章节的回答", () => {
  assert.throws(() => buildGuideReply("已发布", undefined));
  assert.throws(() => buildGuideReply("点击发布版本", [source]));
  assert.throws(() => buildGuideReply("点击菜单【来源：docs/product-guide.md · 虚构章节】", [source]));
  assert.throws(() => buildGuideReply("【来源：docs/product-guide.md · 保存草稿与发布版本】【来源：fake.md · 其他资料】", [source]));
});

test("零匹配时返回固定资料不足说明，不使用模型的无依据回答", () => {
  const reply = buildGuideReply("系统支持自动设备控制", []);
  assert.ok(reply.answer.includes("未检索到相关资料"));
  assert.deepEqual(reply.sources, []);
  assert.ok(!reply.answer.includes("自动设备控制"));
});

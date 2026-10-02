import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadGuide, splitGuide } from "./guide.ts";

test("按二级标题拆分，保留三级标题和最后一章，忽略文档简介", () => {
  const markdown = [
    "# 产品操作指南",
    "介绍文字不参与章节检索。",
    "",
    "## 保存草稿与发布版本  ",
    "",
    "保存草稿不会发布。",
    "### 发布版本",
    "点击发布版本。",
    "",
    "## 能力边界",
    "助手不能代为发布。",
    "最后一行不能丢失。",
    "",
  ].join("\r\n");

  assert.deepEqual(splitGuide(markdown), [
    {
      title: "保存草稿与发布版本",
      content: "保存草稿不会发布。\n### 发布版本\n点击发布版本。",
    },
    {
      title: "能力边界",
      content: "助手不能代为发布。\n最后一行不能丢失。",
    },
  ]);
});

test("只读加载真实指南，得到六章并保留末尾能力说明", async () => {
  // 相对测试文件定位资料，避免测试依赖从哪个目录启动。
  const filePath = fileURLToPath(new URL("../../../docs/product-guide.md", import.meta.url));
  const before = await readFile(filePath, "utf8");
  const sections = await loadGuide(filePath);

  assert.deepEqual(sections.map((section) => section.title), [
    "开始使用",
    "添加组件",
    "绑定数据",
    "保存草稿与发布版本",
    "查看运行态",
    "能力边界",
  ]);
  assert.ok(sections.every((section) => section.content.length > 0));
  assert.ok(sections[1].content.includes("### 添加文本块"));
  assert.ok(sections[5].content.endsWith("不代表真实设备的通用接入规范或运行标准。"));
  assert.equal(await readFile(filePath, "utf8"), before);
});

test("没有二级标题时不产生可检索章节", () => {
  assert.deepEqual(splitGuide("# 文档标题\n介绍文字\n### 三级标题\n正文"), []);
  assert.deepEqual(splitGuide(""), []);
});

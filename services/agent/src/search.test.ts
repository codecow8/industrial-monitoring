import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadGuide } from "./guide.ts";
import { searchGuide } from "./search.ts";

const guidePath = fileURLToPath(new URL("../../../docs/product-guide.md", import.meta.url));

test("发布问题召回保存与发布章节，并返回可引用的原文", async () => {
  const sections = await loadGuide(guidePath);
  const hits = searchGuide(sections, "怎样保存草稿并发布版本？");

  assert.equal(hits[0]?.title, "保存草稿与发布版本");
  assert.ok(hits[0].content.includes("等待出现“已发布 v…”提示"));
  assert.ok(hits.every((hit) => hit.score > 0));
});

test("数据绑定和组件数量问题优先召回对应章节", async () => {
  const sections = await loadGuide(guidePath);

  assert.equal(searchGuide(sections, "数据键在哪里设置？")[0]?.title, "绑定数据");
  const componentHit = searchGuide(sections, "可以添加第二个折线图吗？")[0];
  assert.equal(componentHit?.title, "添加组件");
  assert.ok(componentHit.content.includes("这三类组件当前各只能添加一个"));
});

test("空问题、纯标点、问句套话和无匹配资料均返回空结果", async () => {
  const sections = await loadGuide(guidePath);

  for (const query of ["", "  \n ", "？！...", "现在可以帮我吗？", "量子纠缠隐形传态"]) {
    assert.deepEqual(searchGuide(sections, query), [], query);
  }
});

test("英文数据键匹配不区分大小写", async () => {
  const sections = await loadGuide(guidePath);

  assert.equal(searchGuide(sections, "PUMP1.OUTLET_TEMP")[0]?.title, "绑定数据");
});

test("结果最多三章且不会修改原章节，同分时保持原顺序", () => {
  const sections = ["甲", "乙", "丙", "丁"].map((title) => Object.freeze({ title, content: "保存草稿。" }));

  const results = searchGuide(sections, "保存草稿");
  assert.deepEqual(results.map((hit) => hit.title), ["甲", "乙", "丙"]);
  assert.ok(sections.every((section) => !("score" in section)));
});

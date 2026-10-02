# 02：读取指南并拆分章节

Status: resolved

Blocked by: none

## 学习目标

把 Markdown 指南转换成可检索的章节数组。先理解知识来源如何进入工具，不接入模型或网页。

## 已实现接口

创建 `services/agent/src/guide.ts`，导出以下接口：

```ts
export interface GuideSection {
  title: string;
  content: string;
}

export function splitGuide(markdown: string): GuideSection[];
export function loadGuide(filePath: string): Promise<GuideSection[]>;
```

上述为接口签名，实际代码在 `services/agent/src/guide.ts`。`loadGuide` 使用 `node:fs/promises` 的 `readFile` 读取 UTF-8 文件，再调用 `splitGuide`。

拆分规则：

- 只有行首 `## ` 开始一个新章节，标题去掉前缀和首尾空白。
- 内容为该标题之后到下一条二级标题之前的原文，去掉首尾空白。
- 一级标题和第一个二级标题之前的简介不加入章节数组。
- 三级标题 `### ` 保留在章节正文里，不创建新章节。
- 没有二级标题时返回空数组。

只处理当前操作指南的 Markdown 形态，不实现通用 Markdown 解析器。

## 建议思路

先按换行拆成数组。逐行判断是否开始新章节；遇到新标题时收起上一章，其他行加入当前章。循环结束后收起最后一章。

## 验收

- [x] 当前 `docs/product-guide.md` 得到 6 个章节，顺序为开始使用、添加组件、绑定数据、保存草稿与发布版本、查看运行态、能力边界。
- [x] 每章内容非空，三级标题仍在对应正文中。
- [x] 最后一章“能力边界”的末尾内容没有丢失。
- [x] 不含二级标题的输入返回空数组。
- [x] 输入文件内容不被修改。

在仓库根目录使用 Node 的类型擦除运行，不必为本练习安装依赖：

```sh
node --experimental-strip-types --input-type=module -e 'import { loadGuide } from "./services/agent/src/guide.ts"; const sections = await loadGuide("./docs/product-guide.md"); console.table(sections.map(s => ({ title: s.title, chars: s.content.length })));'
```

测试命令为 `node --experimental-strip-types --test services/agent/src/guide.test.ts`，从仓库根目录运行。3 项测试通过。独立 package.json 仅声明 ESM 和测试命令，未添加 pnpm workspace 配置、SDK 依赖、HTTP 服务或检索排序。

## Comments

- 2026-10-02：指南和预期问答已经准备；用户要求进入下一步，创建本练习。由用户先实现，助手随后检查和验证。
- 2026-10-02：用户授权助手编写全部代码并加注释。已完成两个公开接口、拆分与文件读取测试，以及真实指南输出检查。此结果仅代表资料读取与拆分完成，不代表检索或模型问答已验证。

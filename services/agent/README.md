# 产品使用问答 Agent

当前已完成指南读取、本地章节检索、Pi 自定义只读工具及内存会话，支持终端、HTTP 和本机 Vue 网页侧栏问答。

## 数据流

`docs/product-guide.md` → `loadGuide()` → 章节数组 → `searchGuide(sections, query)` → 最多三个 `{ title, content, score }`。

- `src/guide.ts`：按二级标题拆分，保留三级标题及原文正文。
- `src/search.ts`：使用 Node 内置中文分词；标题匹配权重更高，返回正分候选章节。
- `src/guide-tool.ts`：`createGuideSearchTool(sections)` 将检索包装为 `search_product_guide` 工具。参数 Schema 只允许非空、最多 500 字符的 `query`，不接受文件路径。
- `src/session.ts`：建立 Pi 内存会话，复用本机登录和模型偏好；绑定页面后启用指南、历史及活动三个只读工具，隔离编程资源。
- `src/cli.ts`：终端问答入口，同一进程复用会话，退出后释放会话与网络连接。
- `src/conversation.ts`：HTTP 的 Pi 会话适配器，验证真实检索来源，失败回退到请求前上下文。
- `src/http.ts`：路由、内存会话、闲置清理、去重、超时及请求安全边界。
- `src/http-main.ts`：代理初始化及仅本机的 8001 端口入口。
- 排序分数不是置信度，相关章节也不一定包含问题答案。同义词和省略式追问需要后续 Agent 处理。

## Pi 工具调用流程

Pi 根据用户问题生成 `{ query }`，按 `parameters` 校验后调用 `execute`。工具调用已有的 `searchGuide`，返回 `found` 或 `not_found`、候选章节和资料边界提示；Pi 再根据原文生成带来源的回答。

`content` 中的 JSON 文本交给模型阅读；`details` 保留同一份结构化数据。每条候选资料包含 `source`、`title`、`content`，不向模型提供排序分数，避免把分数当成置信度。来源固定为 `docs/product-guide.md`，工具只能检索启动时传入的章节。

工具本身不生成最终回答，也不保存聊天记录。会话显式设置工具白名单，使用空资源加载器，不加载项目或全局扩展、技能、提示模板及 AGENTS.md。`SessionManager.inMemory` 不创建会话文件；模型配置和登录仍由 Pi 的本机文件管理。模型供应商的数据保留政策不属于本地会话清空的保证。

## 终端使用

从仓库根目录运行：

```sh
pnpm --dir services/agent dev
```

需要先在 Pi 中配置可用模型并登录，不在项目中保存凭据。当前默认会读取本机 Pi 的模型偏好；启动时显示实际选用的供应商和模型。连续提问可使用“怎样发布？”→“那在哪里查看结果？”。输入 `/exit` 或 Ctrl+D 退出，重新启动即为新会话。

入口显式通过 Undici 沿用 `HTTP_PROXY`、`HTTPS_PROXY`、`NO_PROXY` 等环境代理，避免 SDK 导入后请求变成直连。不硬编码代理地址，不修改系统配置。模型失败会显示错误，不用上一轮回答冒充本轮结果。

2026-10-02：使用本机默认模型 `openai-codex/gpt-5.6-sol` 完成发布、连续追问、MQTT 资料不足、拒绝直接发布四轮终端冒烟；均观察到指南检索及来源引用。这不是完整问答验收，也不代表浏览器会话生命周期已验证。

## 验证

从仓库根目录运行。Agent 使用独立的 pnpm workspace 和锁文件，不修改根目录前端的依赖解析：

```sh
pnpm --dir services/agent install --frozen-lockfile
pnpm --dir services/agent test
pnpm --dir services/agent typecheck
pnpm --dir services/agent audit
```

现有根目录 `test` 脚本尚未包含本服务，请使用上面的独立测试命令。按用户要求，SDK 固定到 2026-10-02 核对的官方稳定最新版 `1.0.0`，TypeBox 对齐 SDK 使用的 `1.3.27`，不使用浮动 `latest`。要求 Node >=22.19.0；本机 Node 22.22.3 满足要求。本次不改变全局 Pi CLI，也不修改登录或模型配置。

2026-10-02：此前 npm 无法覆盖 SDK 内部锁定的 `brace-expansion`；本服务改用 pnpm，将其固定为 `5.0.12`。实际依赖树、冻结锁文件安装及完整 `pnpm audit` 均通过，未发现已知漏洞。生成的 `package-lock.json` 已移除，统一使用 `pnpm-lock.yaml` 复现，没有变更全局 Pi 或根目录锁文件。审计不等于安全保证，仍仅供本机使用。

## HTTP 使用

从仓库根目录运行：

```sh
pnpm --dir services/agent dev:http
```

服务仅监听 `http://127.0.0.1:8001`，不是网页，不支持浏览器地址栏 GET。无需启动 Python 业务 API 即可测试产品指南问答。

所有请求使用 JSON POST，带 `X-Industrial-Help: 1`。网页来源只允许本机 5173 / 4173 / 4174；拒绝任意网页、错误 Host 和 `Origin: null`。这不是企业多人鉴权，不能对外开放。Electron 后续需明确安全桥接，不能直接放开 null 来源；当前网页侧栏检测到 Electron 会说明尚未启用。

- `POST /api/help/sessions`，请求 `{}`，返回 `201 { sessionId, idleTimeoutSeconds: 900 }`。
- `POST /api/help/sessions/<sessionId>/questions`，请求 `{ requestId, question }`，返回 `200 { requestId, answer, sources }`。
- 客户端生成 UUID 请求编号；重试保留编号与原问题，换问题必须换编号。
- `sources` 包含本轮实际检索并引用的 `{ source, title, content }`，正文取自指南，不接受模型伪造来源。无匹配时返回固定资料不足说明及空来源。

客户端只在当前标签页内存保存会话编号，不写 localStorage。关闭侧栏不取消生成，刷新新建会话。旧会话闲置 15 分钟后清理：每 30 秒后台扫描，访问时立即检查过期；服务重启也会清空。收到 410 必须告知上下文失效，不能静默开始新会话并假装记得旧内容。

同一会话只接受一轮生成：并发相同编号共用结果，其他编号返回 409；成功结果按编号缓存。60 秒超时返回 504 并终止模型，终止结算前不放行新生成；晚到结果不缓存。SDK 失败后回退到请求前上下文，重试不重复加入用户问题。HTTP 客户端断开不取消已接受的问答。

上限为 20 个会话、每会话 100 个请求编号、8 KB 请求体及 1–1000 字非空问题。主要错误：`SESSION_EXPIRED`（410）、`SESSION_BUSY` / `REQUEST_ID_CONFLICT`（409）、`MODEL_TIMEOUT`（504）、`MODEL_ERROR`（502）、`INVALID_INPUT`（400）、来源 / Host 限制（403）、容量限制（429）。错误不透传供应商细节或凭据。

2026-10-02：22 项离线测试和类型检查通过；真实 HTTP 模型完成发布及追问两轮，重复编号返回一致缓存。超时、串行、隔离、过期及跨站拦截用可控会话工厂验证；未执行全部 14 例真实模型或 Vue 浏览器验收。

## 网页使用

在根目录分别运行 `pnpm dev:api`、`pnpm dev:agent`、`pnpm dev`，业务 API 需要现有 PostgreSQL。打开 `http://localhost:5173/editor/demo`，点击顶部“使用帮助”。Vite 将 `/api/help` 转发到本机 8001，其他业务 API 路由不变。没有模型凭据进入前端。

前端状态测试：`pnpm --filter @industrial/web test:help`。2026-10-02 网页实测通过发布及连续追问、来源展开、关闭重开保留、刷新清空；客户端 4 项状态测试通过。失败重试及过期重置以可控网络响应测试，不代表所有真实模型、浏览器或 Electron 状态已验收。

## 第二阶段：独立历史工具切片

`src/alarm-history.ts` 是固定本机历史接口的只读适配器；`src/alarm-history-tool.ts` 的 `createAlarmHistoryTool(pageId)` 只允许模型选择开始或继续，不允许扩大页面、地址、数量或时间范围。分页固定截止时间，版本或快照变化时不混用数据，失败与空记录明确区分。

目前已接入 Pi / HTTP / Vue，Agent 共 34 项测试及类型检查通过。创建会话可发送 `{ pageId: "demo" }`，绑定后注册历史工具；`{}` 保持原来的指南会话。Vue 自动绑定当前编辑器页面，切页重新创建会话；提问不能改绑页面，模型不能传其他页面、URL、条数或时间窗。

历史每轮最多读取一批，模型选择调用工具，业务数量、时间窗与来源由校验后的工具数据生成，响应新增 `history` 字段；历史来源使用 `history-query:<queryId>` 和 `history-record:<recordId>`，正文来自接口数据。普通产品指导仍执行指南引用校验。分页失败及问答失败不会静默跳过一批，快照或发布版本变化不能混页。

旧接口在同一数据键多个阈值下的 ID 冲突已复现并修复：ID 纳入完整条件，原始观测 ID 保持不变。业务 API 20 项测试通过。真实模型通过 HTTP 完成一次绑定 demo 的空结果查询；回归测试页面的两条阈值记录已通过真实模型网页展示及观测展开。客户端 7 项状态测试通过，未执行真实模型批量分页、完整 E2E 或 Electron 功能验收。

Vue 分页使用问题请求的可选 `historyCommand: { action: "next", queryId: "..." }`，绑定当前会话内的查询游标。服务端记住各查询范围，并把命令纳入请求编号幂等判断；不能用同一编号改换动作。业务请求仍只读，不允许模型传入查询编号来切换页面。

2026-10-02：增加显式启用的 `tests/live/help-history-pagination.spec.ts`。独立测试页产生 21 条已恢复记录；真实模型网页验收 20+1 分页、固定查询截止时间、唯一记录 ID 与首尾观测展开。另以真实业务 API 验证发布 v2 后旧分页返回 `version_changed`。本轮 Agent 34 项、Web 客户端 7 项测试及 Web 构建通过。运行方式和验收边界见 `.scratch/alarm-query-agent/issues/05-live-pagination.md`。

## 第三阶段：活动告警查询

`read_active_alarms` 已注册到页面绑定的 Pi 会话，并通过 HTTP 与 Vue 侧栏展示真实结果。`src/active-alarms.ts` 校验当前发布版本、查询时间、来源与资料覆盖；`src/active-alarm-tool.ts` 固定当前页面并区分缺数、过期、未配置与查询失败。最多返回 20 条，故障优先，5 秒没有新服务器观测即过期。

回复的可选 `active` 包含查询编号及业务快照；来源使用 `active-query:<queryId>`、`page:<pageId>:v<version>`、`observation:<id>`。模型负责选择工具，结果数量与来源由业务资料生成。一轮内不自动刷新；用户点击重新查询才读取新快照，失败保留旧快照，重试沿用请求编号。

2026-10-02：Agent 40 项测试、类型检查及 Web 客户端 9 项测试、Web 构建通过。独立模拟页的真实模型网页查询展示两条过期告警，并核对实际观测 ID；发送恢复观测后重新查询得到 0 条，替换旧快照。由于查询时观测已过期，页面仍提示资料不足，未宣称当前设备正常。后端 26 项测试在前一切片通过；没有执行所有真实模型分支、全项目 E2E 或 Electron 验收。

## 显式真实模型验收

剩余 9 个常见问题的接口验收脚本不加入普通 `test`，只有显式启用才消耗模型额度：

```sh
LIVE_HELP_EVAL=1 pnpm --dir services/agent eval:help
# 可仅复测有改动的案例
LIVE_HELP_EVAL=1 pnpm --dir services/agent eval:help Q3 Q11
```

每例独立会话，自动核对来源路径、章节及正文与当前指南一致，输出回答供人工检查关键事实。脚本退出成功不等于语义验收通过；Q7 连续追问与 Q14 实际刷新需另行检查。普通开发只运行不耗模型的单元测试，不反复调用此脚本。

2026-10-02：14 个固定案例已累计核对通过，详细初轮不足及定向复测记录见 `.scratch/product-help-agent/acceptance.md`。仅完善通用回答完整性及每轮检索规则，没有放宽来源校验。不是任意问法的正确率保证，也没有重跑全量项目 E2E。

在代码中使用：

```ts
import { loadGuide } from "./src/guide.ts";
import { searchGuide } from "./src/search.ts";

const sections = await loadGuide("../../docs/product-guide.md");
const matches = searchGuide(sections, "数据键在哪里设置？");
```

上述读取路径以 `services/agent` 为工作目录。测试文件使用相对自身的文件 URL 定位指南，不依赖启动目录。

直接观察工具输出（不调用模型、不使用凭据）：

```sh
cd services/agent
node --experimental-strip-types --input-type=module -e 'import { loadGuide } from "./src/guide.ts"; import { createGuideSearchTool } from "./src/guide-tool.ts"; const tool = createGuideSearchTool(await loadGuide("../../docs/product-guide.md")); console.log(await tool.execute("demo", { query: "怎样发布版本？" }));'
```

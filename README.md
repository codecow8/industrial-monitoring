# Industrial Monitoring

工业智能监控与巡检平台。编辑器通过统一 `PageSchema` 配置指标卡、实时趋势图、设备状态、活动告警列表和纯文本块，运行态使用同一个 Renderer 和组件注册表读取并渲染；草稿通过 FastAPI 校验并保存到 PostgreSQL，发布后生成不可变版本供运行态读取。

## Task 1 范围

- Vue 编辑态与运行态两个路由
- 一个指标卡组件
- TypeBox + Ajv Schema 合同
- 属性编辑、拖动、缩放
- 本地保存、Schema 导入/导出
- 单元测试与浏览器链路测试

Task 1 不包含后端、WebSocket、ECharts、Electron、小程序或 Agent。

Task 2 已完成草稿持久化、发布版本与实时遥测三个切片；Task 3 已完成实时趋势图、组件右键删除、设备状态、活动告警列表和 Electron 桌面壳。小程序、真实设备、持久化历史曲线和 Agent 仍不在当前实现范围内。

## 目录职责

```text
apps/web                 编辑器与运行态入口
apps/electron            复用 Web Renderer 的安全 Electron 桌面壳
packages/schema          PageSchema 与运行时校验
packages/renderer-core   不依赖 Pinia 的 DOM Renderer
packages/components-web  指标卡、实时趋势图、设备状态、活动告警列表、纯文本块和 Web 组件注册表
packages/telemetry-client WebSocket 会话、帧合并、过期与重连状态
services/api             FastAPI 页面/遥测接口与 Alembic 迁移
services/agent           Pi SDK 产品使用问答，仅本机、只读指南检索
services/simulator       每秒推送确定性温度和设备状态序列的独立 Python 进程
fixtures                 前后端共享的 PageSchema 合同和样例
```

## UI 设计流程

单一可变 HTML 原型是 UI 设计源，Vue 是可执行实现。所有 UI 变更（包括右键菜单、按钮和间距微调）都先原地更新 `industrial-editor.html` 并获得明确评审通过，再进入 Vue 实现。历史由 Git 保留，不在工作树中复制原型版本。详见 [UI Design Workflow](./docs/design-workflow.md)。

从仓库根目录启动原型：

```bash
pnpm dev:prototype
```

打开 `http://127.0.0.1:4311/industrial-monitoring-v1/industrial-editor.html`。原型服务独立于 Vue 开发服务（5173）和 API（8000）；按 `Ctrl+C` 停止。

## 当前接口

```text
PUT  /api/pages/{page_key}/draft
GET  /api/pages/{page_key}/draft
POST /api/pages/{page_key}/publish
GET  /api/pages/{page_key}/published
GET  /api/pages/{page_key}/versions/{version}
POST /api/telemetry
GET  /api/pages/{page_key}/alarm-evidence
GET  /api/pages/{page_key}/alarm-history
POST /api/pages/{page_key}/alarm-diagnoses
WS   /ws/telemetry/pages/{page_key}
```

运行态只读取 `published`，不会直接显示尚未发布的草稿修改。

纯文本块支持多行内容、12–64 的字号、十六进制文字颜色和左/中/右对齐。编辑器可添加多个文本块并复用拖动、缩放、保存和发布；运行态仅显示文字，不绑定 Data Point，不解析 HTML、Markdown 或富文本。

告警证据接口按已发布页面中的 `kind`（`threshold` / `fault`）、`dataKey`、`start` 和 `end` 查询。阈值告警还需提供 `threshold`。`start`、`end` 使用带时区的 ISO 8601 时间，单次最多 15 分钟和 1000 条观测。响应包含页面发布版本、观测记录 ID、来源时间、服务端接收时间和可由相邻观测证明的触发/恢复转折；查询可跨越发布时间，但当前版本发布前的观测不会按新规则解释。缺少前一条正常观测时，不推断告警起点。模拟遥测在 PostgreSQL 保留 24 小时，并于后续遥测写入时清理过期记录。

历史告警从当前发布版本内最近 24 小时的观测，配对可证实的触发与恢复；无前态或尚未恢复的告警不伪造成历史记录。运行态“活动告警”卡片的“历史”入口在 0 条活动告警时也可使用。`GET /api/pages/{page_key}/alarm-history` 每次返回最多 100 条，默认 20 条；`offset` 翻页，后续请求传首次响应的 `windowEnd` 作为 `asOf`，防止实时新观测导致翻页重复。面板滚动到末尾时继续加载。

运行态活动告警的“智能分析”调用后端诊断接口。后端会重新校验当前发布版本与近期活动告警，并从 PostgreSQL 查询观测；至少两条选中告警的观测才调用模型，否则返回“证据不足”。默认提供方是 DeepSeek（`deepseek-flash`）；设置 `AI_PROVIDER=openai` 可切换到 OpenAI（默认 `gpt-6-luna`），`AI_MODEL` 可覆盖所选提供方的模型名。后端分别读取 `DEEPSEEK_API_KEY` 和 `OPENAI_API_KEY`；旧的 `OPENAI_DIAGNOSIS_MODEL` 在 OpenAI 模式下仍可用。密钥不要放在 `VITE_` 变量或浏览器中。结果中的引用必须属于本次查询的观测或项目模拟手册；服务不可用时界面会提供重试，不会伪装成分析结论。本功能只用于模拟项目，不提供设备控制建议。

## 环境准备

- Node.js `>=22.12`
- Python 3.12 与 uv
- Docker Desktop

仓库通过 `packageManager` 固定 pnpm 12.4.1。启用 Corepack 的 `pnpm` 命令入口后，在仓库内直接使用 `pnpm` 即可自动选择该版本；不需要每次写 `corepack pnpm@12.4.1`。

如果 macOS 可以启动 Docker Desktop、但 Shell 找不到 `docker`，本次机器可临时执行：

```bash
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
```

## 本地运行

```bash
pnpm install
docker compose up -d postgres
pnpm db:migrate
pnpm dev:api
```

`pnpm dev:api` 只启动后端，默认使用 DeepSeek。首次在本机配置密钥时运行下面的命令，按提示输入密钥；它会进入 macOS 钥匙串，不写入项目或命令历史：

```bash
security add-generic-password -a "$(id -un)" -s industrial-monitoring-deepseek -U -w
```

此后直接运行 `pnpm dev:api`，启动脚本会在未设置 `DEEPSEEK_API_KEY` 时从钥匙串读取。环境变量优先于钥匙串。切换 OpenAI 或指定 DeepSeek 模型时：

```bash
AI_PROVIDER=openai pnpm dev:api
AI_MODEL=deepseek-v4-pro pnpm dev:api
```

OpenAI 模式的钥匙串名称为 `industrial-monitoring-openai`，首次也可用同样的 `security add-generic-password` 命令保存。非 macOS 或企业部署环境由部署平台提供对应后端环境变量。缺少密钥时其他 API 仍能启动，智能分析会提示未配置。

另开一个终端：

```bash
pnpm dev
```

再开一个终端启动设备模拟器：

```bash
pnpm dev:simulator
```

默认地址：`http://127.0.0.1:5173/editor/demo`。Vite 将业务 `/api` 和 `/ws` 代理到 `http://127.0.0.1:8000`，`/api/help` 单独代理到 8001。发布 `demo` 页后打开运行态，指标卡会按 `68.4 → 72.0 → 78.5 → 81.2 → 83.0 → 79.0 → 74.0` 循环更新，设备状态会按“运行 → 维护 → 运行 → 故障 → 停止 → 运行”循环更新。

## 产品使用帮助

编辑器顶部“使用帮助”通过 Pi SDK 检索 [产品操作指南](./docs/product-guide.md)，回答附可展开的原文来源。它只提供操作指导，不修改页面、不代为发布、不查询实时设备数据。

Agent 要求 Node >=22.19.0，使用独立 pnpm 锁文件。先在本机 Pi 配置模型并登录，再从根目录运行：

```bash
pnpm --dir services/agent install --frozen-lockfile
pnpm dev:agent
```

服务仅监听 `127.0.0.1:8001`，复用 Pi 登录，不复用上文告警分析的 DeepSeek 环境变量。网页侧栏关闭后保留本次对话、刷新后清空，后台闲置 15 分钟后清理；过期需要主动开始新会话。当前不开放 Electron 或多人共享个人登录。

客户端测试为 `pnpm --filter @industrial/web test:help`，Agent 测试为 `pnpm --dir services/agent test`。真实模型验收需显式启用，不随普通测试运行。更多启动、安全边界及验收说明见 [Agent README](./services/agent/README.md)。

## Electron 桌面壳

Electron 复用 `apps/web` 源码，不复制页面组件。FastAPI 和 PostgreSQL 仍作为外部服务运行，先启动后端，再启动桌面应用：

```bash
pnpm dev:api
pnpm dev:electron
```

生产构建和 macOS arm64 未签名应用：

```bash
pnpm build:electron
pnpm package:electron
```

生成的 `.app` 位于 `apps/electron/release/mac-arm64/`，构建产物不提交 Git。默认连接 `127.0.0.1:8000`；可通过 `INDUSTRIAL_API_ORIGIN` 和 `INDUSTRIAL_WS_ORIGIN` 指向其他外部后端。

## 验证

```bash
pnpm test
pnpm test:api
pnpm typecheck
pnpm build
pnpm build:electron
pnpm package:electron
pnpm test:e2e
pnpm exec playwright test --config playwright.ui.config.ts
cd services/api && uv run --python 3.12 pytest evals
```

真实 DeepSeek 端到端验收默认不会随日常测试运行。确认本地 PostgreSQL 可用、后端进程能读取 `DEEPSEEK_API_KEY` 后，显式运行：

```bash
pnpm build
LIVE_MODEL_EVAL=1 pnpm exec playwright test --config playwright.live.config.ts
```

验收会创建独立的模拟页面和遥测记录，并产生两次真实模型请求：分别分析温度越界和设备故障；另验证单点证据不足与恢复后告警消失。密钥只由后端读取，不写入测试或浏览器。

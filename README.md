# Industrial Monitoring

工业智能监控与巡检平台。编辑器通过统一 `PageSchema` 配置指标卡、实时趋势图、设备状态和活动告警列表，运行态使用同一个 Renderer 和组件注册表读取并渲染；草稿通过 FastAPI 校验并保存到 PostgreSQL，发布后生成不可变版本供运行态读取。

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
packages/components-web  指标卡、实时趋势图、设备状态、活动告警列表和 Web 组件注册表
packages/telemetry-client WebSocket 会话、帧合并、过期与重连状态
services/api             FastAPI 页面/遥测接口与 Alembic 迁移
services/simulator       每秒推送确定性温度和设备状态序列的独立 Python 进程
fixtures                 前后端共享的 PageSchema 合同和样例
```

## UI 设计流程

单一可变 HTML 原型是 UI 设计源，Vue 是可执行实现。所有 UI 变更（包括右键菜单、按钮和间距微调）都先原地更新 `industrial-editor.html` 并获得明确评审通过，再进入 Vue 实现。历史由 Git 保留，不在工作树中复制原型版本。详见 [UI Design Workflow](./docs/design-workflow.md)。

## 当前接口

```text
PUT  /api/pages/{page_key}/draft
GET  /api/pages/{page_key}/draft
POST /api/pages/{page_key}/publish
GET  /api/pages/{page_key}/published
GET  /api/pages/{page_key}/versions/{version}
POST /api/telemetry
WS   /ws/telemetry/pages/{page_key}
```

运行态只读取 `published`，不会直接显示尚未发布的草稿修改。

## 环境准备

- Node.js `>=22.12`
- Python 3.12 与 uv
- Docker Desktop

如果 macOS 可以启动 Docker Desktop、但 Shell 找不到 `docker`，本次机器可临时执行：

```bash
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
```

## 本地运行

```bash
corepack pnpm@12.4.1 install
docker compose up -d postgres

cd services/api
uv sync --python 3.12
uv run --python 3.12 alembic upgrade head
uv run --python 3.12 uvicorn industrial_api.main:app --reload --port 8000
```

另开一个终端：

```bash
corepack pnpm@12.4.1 dev
```

再开一个终端启动设备模拟器：

```bash
corepack pnpm@12.4.1 dev:simulator
```

默认地址：`http://127.0.0.1:5173/editor/demo`。Vite 将 `/api` 和 `/ws` 代理到 `http://127.0.0.1:8000`。发布 `demo` 页后打开运行态，指标卡会按 `68.4 → 72.0 → 78.5 → 81.2 → 83.0 → 79.0 → 74.0` 循环更新，设备状态会按“运行 → 维护 → 运行 → 故障 → 停止 → 运行”循环更新。

## Electron 桌面壳

Electron 复用 `apps/web` 源码，不复制页面组件。FastAPI 和 PostgreSQL 仍作为外部服务运行，先启动后端，再启动桌面应用：

```bash
corepack pnpm@12.4.1 dev:api
corepack pnpm@12.4.1 dev:electron
```

生产构建和 macOS arm64 未签名应用：

```bash
corepack pnpm@12.4.1 build:electron
corepack pnpm@12.4.1 package:electron
```

生成的 `.app` 位于 `apps/electron/release/mac-arm64/`，构建产物不提交 Git。默认连接 `127.0.0.1:8000`；可通过 `INDUSTRIAL_API_ORIGIN` 和 `INDUSTRIAL_WS_ORIGIN` 指向其他外部后端。

## 验证

```bash
corepack pnpm@12.4.1 test
corepack pnpm@12.4.1 test:api
corepack pnpm@12.4.1 typecheck
corepack pnpm@12.4.1 build
corepack pnpm@12.4.1 build:electron
corepack pnpm@12.4.1 package:electron
corepack pnpm@12.4.1 test:e2e
```

# 01: Electron 桌面壳闭环

**What to build:** 将现有 Vue 编辑器和运行态装入安全的 Electron 桌面壳，在不复制 UI、不内置 Python/PostgreSQL 的前提下支持开发启动和 macOS arm64 未签名应用构建。

**Blocked by:** Task 3-04 活动告警列表组件闭环.

**Status:** resolved

- [x] `apps/electron` 使用 Electron 与 electron-vite，Renderer 直接复用 `apps/web` 源码
- [x] Main Process 创建窗口并通过安全自定义协议加载生产资源
- [x] `/api` 同源代理到可配置的外部 FastAPI，WebSocket 地址通过 Preload 白名单配置暴露
- [x] `contextIsolation` 与 `sandbox` 开启，`nodeIntegration` 关闭，禁止新窗口
- [x] Web 版继续使用现有 Vite 代理，不改变浏览器开发链路
- [x] Electron 类型检查、生产构建和 macOS arm64 未签名 `.app` 打包通过
- [x] 桌面窗口能打开现有编辑器，Renderer 不暴露 Node 全局

## Comments

- 2026-09-23：用户确认最小 Electron 范围；不做后端内置、原生文件、自动更新、托盘、签名、公证或 DMG。
- 2026-09-23：核对当前稳定版本：Electron 44.4.3、electron-vite 5.0.0、electron-builder 26.15.3；Electron 包单独使用 Vite 7，Web 包保持 Vite 8。
- 2026-09-23：Electron 类型检查、生产构建和未签名 arm64 `.app` 打包通过；打包应用通过 `app://industrial-monitoring` 渲染编辑器，API 健康检查返回 200，Renderer 中 `window.require` 与 `window.process` 均未暴露。
- 2026-09-23：`dev:electron` 成功启动 electron-vite Renderer、Main Process 与 Preload；测试结束后已主动关闭开发进程。
- 2026-09-23：用户已在桌面应用中检查界面并确认无问题，批准提交。

## Answer

最小 Electron 桌面壳已完成。开发态和生产态均复用现有 Web Renderer；生产态通过安全自定义协议加载资源并同源代理 `/api`，Preload 只暴露 WebSocket 地址配置，后端仍独立运行。

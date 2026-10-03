# 03：正式客户端、Renderer 与运行态接入

Status: resolved
Blocked by: 01, 02

## 验收

逐键服务器来源计龄；旧快照重连、客户端时钟变化不重置年龄；发布变化保留旧页面并阻止跨版本合并与业务查询；缺数及过期正常值使用资料不足空态。完成定向测试、Web 和 Electron 构建。

## Comments

- 2026-10-03：原型获批，开始实现。

## Answer

- 按各键实际服务器来源计龄，单调时钟推进；旧来源重连只增加年龄，乱序、无来源、发布前和未来观测不覆盖最后可信值。仍按动画帧合并快速更新，重复来源不增加趋势样本。
- Renderer 区分 waiting、partial、stale、ready、unconfigured；缺数、过期正常值不冒充全部正常，过期告警保留。
- 运行态按已加载的发布版本订阅。新版到达后取消待合并数据和重连，保留旧布局及值、禁用查询并丢弃已发请求的结果；手动刷新加载最新版本。
- 用户批准的单一设计资产已标记 approved，正式页面与原型一致。

## 验证

- 共享包 39 项测试通过（Schema 12、Telemetry 9、Renderer 10、组件 8）；Web 类型检查和生产构建、Electron 构建通过。
- API 30 项通过；同一数据库来源的新 Hub 快照与 Agent 活动查询一致，智能分析使用同一 5 秒阈值。
- 定向真实 HTTP / WS / Web 浏览器 5 项通过；分析重试和历史分页边界替身 UI 2 项通过。
- 本机预览 `http://127.0.0.1:4174`、1440×960；浏览器测试插件未提供（Browser plugin not available），使用项目现有 Playwright 流程。
- 页面身份、非空内容、无框架覆盖、无应用 console/pageerror、刷新操作和截图检查均通过。
- 正式截图：`/tmp/industrial-runtime-version-formal.png`、`/tmp/industrial-runtime-fresh-formal.png`。
- 客户端时钟跳变和同实例重连通过公开客户端替身测试；数据库旧快照通过真实 Web 重载验证。没有修改电脑真实时间，也没有进行 Electron 原生或部署验收。构建保留既有打包提示。

## Comments

- 2026-10-03：实现与定向验收完成。首次新 E2E 的标题断言误用了英文，已按项目实际标题“工业智控平台”修正并通过。

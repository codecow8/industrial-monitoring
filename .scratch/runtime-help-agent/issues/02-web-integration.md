# Web 运行态帮助正式接入

Status: resolved
Blocked by: 01

## Answer

用户批准原型后完成 RuntimeView / ProductHelpPanel / productHelp 的接入、路由登录前提、移除运行态退出按钮、登录回跳说明和版本隔离。客户端 15 项测试、Agent 48 项测试、3 项浏览器 E2E、Web/Electron 构建通过；唯一一轮真实 Pi 用户问题通过。详情与实际边界见 ../acceptance.md。

本切片完成时，后端公开读取合同未改，没有将前端路由保护当作后端授权。2026-10-04 后续已完成 GET 与 WS 登录保护，见 [后台保护验收](../../runtime-data-auth/acceptance.md)。

## Comments

- 2026-10-03：原型已通过，完成前端与定向验收，没有追加模型流程或整体提交现有登录改动。

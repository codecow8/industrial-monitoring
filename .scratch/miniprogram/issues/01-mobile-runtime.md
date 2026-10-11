# 登录与实时监控
Status: resolved

先接入小程序账号会话，复用已发布 PageSchema、TelemetrySession 和纯告警规则。小程序隐藏时断开，显示时复验账号与版本并重建订阅。旧快照不可使过期数据恢复新鲜。

验收：Bearer/浏览器 Cookie 隔离、HTTP/WS 撤销过期、错误密码/频率限制；请求/Socket 适配与构建检查。

## Answer

已实现；验收证据与未验收边界见 ../acceptance.md。

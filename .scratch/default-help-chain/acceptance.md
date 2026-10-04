# 默认网页帮助链路验收

2026-10-04，Asia/Shanghai。本轮未提交、推送或部署。

## 结果

默认开发链路通过：1440×960 Chromium，http://127.0.0.1:5173/runtime/default-help-19a764ed-c41a-4afd-9b38-887669aa8af7 → Vite默认代理 → 127.0.0.1:8001生产帮助HTTP → 127.0.0.1:8000受保护业务API。无帮助请求拦截、随机帮助服务器或回复替身。

实际会话模型 openai-codex/gpt-5.6-sol，由运行中的默认Agent服务 help-session-created 日志与真实浏览器sessionId对应核对，不用偏好配置替代。只提交一条用户问题，测试主体17.023秒（含页面/API准备与问答，不含worker账号夹具），整次Playwright命令19.6秒；不把它当纯模型延迟。Pi工具循环的供应商调用次数未统计。没有重试或追加真实提问。

## 修改

- services/agent/src/http.ts 增加可选会话创建观测，只有sessionId/provider/id；http-main.ts输出这三个实际字段，不输出内部登录身份、Cookie、问题或工具资料。
- http.test.ts验证观测字段边界以及网页回复不暴露模型记录。
- playwright.default-help.config.ts、tests/live/default-help.spec.mts新增独立显式验收，workers1、retries0；默认普通E2E仍为19项，不包含此入口。
- Agent README记录两种显式命令与服务启动/日志要求。没有产品界面变更。

## 验证与首次记录

| 检查 | 结果 |
| --- | --- |
| Agent普通测试及类型检查 | 53/53，tsc通过，不调用模型 |
| 无模型预检首次 | 失败，0条问题；匿名上下文继承测试登录状态，收到201 |
| 显式清空storageState后的预检 | 通过，0条问题；匿名401、登录会话201、真实业务读取及WS连接 |
| 唯一一轮真实问题 | 通过，1条问题；帮助HTTP200，页面/v1/两条观测来源与独立API读取一致 |
| 新鲜度 | queriedAt下status ready，两条fresh；逐条按服务器receivedAt与5秒规则核对 |
| 浏览器 | 目标URL、非空运行画面、使用帮助与来源展开通过；无pageerror和console error，截图无框架错误遮罩 |
| 原始报告凭据检查 | 三份JSONL均无industrial_session赋值标记；Cookie与密码不写报告 |

原始文件追加写入，不覆盖：

- [首次无模型失败](./runs/8a8e7541-69e5-45a1-ace5-31f77ca6b188.jsonl)
- [修正后的无模型预检](./runs/a55806c0-22cc-4c60-a4a5-a3b0b6e38753.jsonl)
- [唯一真实结果](./runs/19a764ed-c41a-4afd-9b38-887669aa8af7.jsonl)

最后报告的semanticReview保留pending，以下是Codex人工阅读记录，不冒充用户签收：回复明确本页v1、两条已观测触发及查询时刻，不推断健康或根因；观测1962=故障状态2、1961=温度83，阈值80。来源展开显示观测1962、页面条件及服务器时间。

截图位于 /tmp/industrial-default-help-19a764ed-c41a-4afd-9b38-887669aa8af7.png。截图时实时组件已过期，但帮助显示查询时尚未过期的快照；两者时间不同，符合现有合同，不将旧快照标成持续实时状态。

## 服务与边界

运行前lsof/ps核对：原API PID70127工作目录services/api且启动uvicorn；空闲8001启动PID5181的http-main.ts（services/agent），空闲5173启动PID5183的Vite（apps/web，strictPort）。未重启原API或其他用户进程。

Browser插件未提供，按frontend-testing-debugging skill使用项目Playwright；本轮仅桌面Chromium，没有移动端/Electron/生产HTTPS验收。没有扩大产品功能，没有统计重复稳定性或额外问法。首次失败属于无模型测试夹具，修复后预检再执行已授权的唯一真实提问。

测试账号由夹具清理，独立验收页与数据键保留以核对，观测按现有24小时规则清理。本轮启动的5173/8001本机服务保留可用；临时服务日志位于/tmp，未纳入项目。root package.json原有空白保留，未暂存/提交。

2026-10-04 后续：用户同意本地提交本轮模型记录、显式验收入口和首次结果。以上为提交前验收状态，实际提交标识见 Git 历史；根 package.json 空白、临时日志和截图不纳入，不推送、不部署，不追加模型调用。

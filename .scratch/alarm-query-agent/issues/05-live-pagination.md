# 05：真实历史分页与发布版本变化验收

Status: resolved

## 范围

使用独立测试页面和独立数据键创建 21 条有相邻观测证明触发与恢复的历史记录。通过真实 Pi 模型、业务 API 与网页使用帮助侧栏完成首批及下一批查询；另通过真实业务 API 和只读工具检查发布版本变化。

验收脚本：`tests/live/help-history-pagination.spec.ts`。只有设置 `LIVE_HELP_HISTORY_EVAL=1` 时执行；首个案例消耗两轮模型调用。测试页与模拟遥测记录留在本机测试数据库，遥测记录按现有 24 小时策略清理，不涉及现场设备。

## 结果

- 独立测试页的历史接口返回总数 21，首批 20、第二批 1。
- 网页首批显示 20 条，点击“继续查看”后显示 21 条；第二批携带首批查询 ID。
- 两批使用相同窗口起止时间与总数，21 个记录 ID 唯一，且与同一截止时间下的业务 API 记录相同。
- 网页首尾记录可展开，记录 ID 及触发、恢复观测 ID 与接口数据一致。
- 另一个独立页面在取得首批 20 条后发布 v2，继续旧分页返回 `version_changed`，没有追加 v2 数据，再次继续被拒绝。
- 原有离线测试仍通过：Agent 34 项，Web 客户端 7 项，覆盖失败重试、空结果、版本变化和客户端 20+1 合并。
- Web 构建通过。浏览器截图：`/tmp/industrial-help-history-pagination.png`。

## 验证方式

先启动本机业务 API 与问答 Agent。根目录运行 `pnpm build`，随后：

```sh
LIVE_HELP_HISTORY_EVAL=1 pnpm exec playwright test --config playwright.live.config.ts tests/live/help-history-pagination.spec.ts --reporter=line
pnpm --dir services/agent test
pnpm --filter @industrial/web test:help
```

2026-10-02：两项 live 案例分别通过。首轮分页案例末尾的观测文字断言假定恢复观测前重复“观测”二字，与界面“观测 #起点 → #终点”的实际文案不符；修正断言后重跑通过，业务数据和页面行为无改动。

## 边界

只验收本机 Web 的已恢复历史。空结果与查询失败、客户端版本变化及重试主要由已有离线测试覆盖；未在这轮复跑真实模型下的这些全部分支，也未验证 Electron、移动端、现场设备或整个项目的 E2E。

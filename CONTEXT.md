# Industrial Monitoring

本项目描述工业监控页面如何绑定、发布并展示设备数据，以及现场操作员如何判断数据是否可信。

## Language

**Data Point**:
由唯一 `dataKey` 标识的一项设备测量值，例如冷却泵出口温度。
_Avoid_: Metric, field, tag

**Telemetry Update**:
设备数据的一次更新事件，只携带本次发生变化的 Data Point 最新值；它不是数值变化量。
_Avoid_: Increment, delta value, full snapshot

**Telemetry Snapshot**:
运行态首次订阅后收到的全部相关 Data Point 当前值，用作后续 Telemetry Update 的合并基线。
_Avoid_: Telemetry Update, history

**Data Freshness**:
Data Point 是否在预期时间内收到过新 Telemetry Update 的状态，独立于 WebSocket 连接是否仍然存在。
_Avoid_: Online status, connection status

**Trend Sample**:
当前运行会话中按固定时间间隔记录的 Data Point 观测值，用于展示短时趋势；它不是可持久化查询的历史数据。
_Avoid_: Telemetry History, Historical Record

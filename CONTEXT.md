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
运行态首次订阅或重连后收到的相关 Data Point 最新可核对观测，用作后续 Telemetry Update 的合并基线；收到快照不表示其中的观测刚刚更新。
_Avoid_: Telemetry Update, history

**Telemetry Observation**:
服务端收到的一项 Data Point 数值及其接收时间，作为可查询的告警证据；它不是页面会话中的 Trend Sample。
_Avoid_: Telemetry Update, Telemetry Snapshot, Trend Sample

**Data Freshness**:
Data Point 的最新可核对服务器观测是否仍在预期更新时效内的状态。年龄以服务器接收观测的时间为依据，独立于 WebSocket 连接是否仍然存在；重新连接或再次收到同一观测不会重置其年龄。
_Avoid_: Online status, connection status

**Trend Sample**:
当前运行会话中按固定时间间隔记录的 Data Point 观测值，用于展示短时趋势；它不是可持久化查询的历史数据。
_Avoid_: Telemetry History, Historical Record

**Device State**:
设备在生产过程中的运行语义状态，例如停止、运行、故障或维护；它独立于 WebSocket 连接状态和 Data Freshness。
_Avoid_: Connection State, Online Status, Data Freshness

**Active Alarm**:
最近一次可信观测触发、且尚未收到明确恢复观测的 Alarm Condition；Data Freshness 过期不会自动清除它，它也不是可查询的告警历史记录。
_Avoid_: Alarm History, Alarm Event Log

**Alarm Condition**:
由 Data Point 阈值越界或 Device State 故障定义的异常判定；相同 `dataKey`、类型和阈值或状态码表示同一个条件。
_Avoid_: Alarm Record, Notification

**Alarm Transition**:
相邻 Telemetry Observation 证明同一 Alarm Condition 从未触发变为触发，或从触发变为恢复的变化；缺少前一项观测时无法确定转折时间。
_Avoid_: Alarm History, Alarm Acknowledgement

**Historical Alarm Occurrence**:
当前发布版本内、一条有相邻观测证明的触发与之后恢复所组成的历史记录；首版只查询最近 24 小时的演示遥测，不是长期告警事件台账，也不包含尚未恢复的 Active Alarm。
_Avoid_: Active Alarm, Telemetry Observation, Alarm Acknowledgement

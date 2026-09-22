import type { ComponentRegistry } from "@industrial/renderer-core";
import MetricCard from "./MetricCard.vue";
import TrendChart from "./TrendChart.vue";
import DeviceState from "./DeviceState.vue";
import AlarmList from "./AlarmList.vue";

export { MetricCard, TrendChart, DeviceState, AlarmList };
export { resolveDeviceState, type DeviceStateView, type DeviceStateKey } from "./deviceState";

export const webComponentRegistry = {
  "metric-card": MetricCard,
  "trend-chart": TrendChart,
  "device-state": DeviceState,
  "alarm-list": AlarmList,
} satisfies ComponentRegistry;

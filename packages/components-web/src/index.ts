import type { ComponentRegistry } from "@industrial/renderer-core";
import MetricCard from "./MetricCard.vue";
import TrendChart from "./TrendChart.vue";
import DeviceState from "./DeviceState.vue";
import AlarmList from "./AlarmList.vue";
import TextBlock from "./TextBlock.vue";

export { MetricCard, TrendChart, DeviceState, AlarmList, TextBlock };
export { resolveDeviceState, type DeviceStateView, type DeviceStateKey } from "./deviceState";

export const webComponentRegistry = {
  "metric-card": MetricCard,
  "trend-chart": TrendChart,
  "device-state": DeviceState,
  "alarm-list": AlarmList,
  "text-block": TextBlock,
} satisfies ComponentRegistry;

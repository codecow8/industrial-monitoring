import type { ComponentRegistry } from "@industrial/renderer-core";
import MetricCard from "./MetricCard.vue";
import TrendChart from "./TrendChart.vue";
import DeviceState from "./DeviceState.vue";

export { MetricCard, TrendChart, DeviceState };
export { resolveDeviceState, type DeviceStateView, type DeviceStateKey } from "./deviceState";

export const webComponentRegistry = {
  "metric-card": MetricCard,
  "trend-chart": TrendChart,
  "device-state": DeviceState,
} satisfies ComponentRegistry;

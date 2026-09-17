import type { ComponentRegistry } from "@industrial/renderer-core";
import MetricCard from "./MetricCard.vue";
import TrendChart from "./TrendChart.vue";

export { MetricCard, TrendChart };

export const webComponentRegistry = {
  "metric-card": MetricCard,
  "trend-chart": TrendChart,
} satisfies ComponentRegistry;

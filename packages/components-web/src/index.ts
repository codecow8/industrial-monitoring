import type { ComponentRegistry } from "@industrial/renderer-core";
import MetricCard from "./MetricCard.vue";

export { MetricCard };

export const webComponentRegistry = {
  "metric-card": MetricCard,
} satisfies ComponentRegistry;


import type { Component } from "vue";
import type { ComponentNode, ComponentType } from "@industrial/schema";

export { default as PageRenderer } from "./PageRenderer.vue";
export {
  resolveActiveAlarms,
  type ActiveAlarmKind,
  type ActiveAlarmSummary,
  type ActiveAlarmView,
} from "./activeAlarms";

export type ComponentRegistry = Record<ComponentType, Component>;

export interface DataPointView {
  value: number | null;
  freshness: "waiting" | "fresh" | "stale";
  ageMs: number | null;
}

export interface TrendSampleView {
  sampledAt: number;
  value: number;
}

export function componentNodeStyle(node: ComponentNode): Record<string, string> {
  return {
    left: `${node.position.x}px`,
    top: `${node.position.y}px`,
    width: `${node.size.width}px`,
    height: `${node.size.height}px`,
  };
}

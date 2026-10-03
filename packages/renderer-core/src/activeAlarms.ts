import type { MetricCardNode, PageSchema, TrendChartNode } from "@industrial/schema";
import type { DataPointView } from "./index";

export type ActiveAlarmKind = "fault" | "threshold";

export interface ActiveAlarmView {
  id: string;
  kind: ActiveAlarmKind;
  title: string;
  deviceName: string;
  detail: string;
  dataKey: string;
  value: number;
  threshold: number | null;
  unit: string | null;
  precision: number;
  freshness: DataPointView["freshness"];
  ageMs: number | null;
}

export interface ActiveAlarmSummary {
  status: "waiting" | "ready" | "partial" | "stale" | "unconfigured";
  coverage: { configured: number; observed: number; missing: number; stale: number };
  alarms: ActiveAlarmView[];
}

export function resolveActiveAlarms(
  schema: PageSchema,
  dataPoints: Record<string, DataPointView>,
): ActiveAlarmSummary {
  const sourceKeys = [...new Set(schema.components.flatMap((node) =>
    node.type === "metric-card" || node.type === "trend-chart" || node.type === "device-state"
      ? [node.props.dataKey] : [],
  ))];
  const observed = sourceKeys.filter(key => dataPoints[key]?.value != null && dataPoints[key]?.freshness !== "waiting");
  const coverage = { configured: sourceKeys.length, observed: observed.length,
    missing: sourceKeys.length - observed.length,
    stale: observed.filter(key => dataPoints[key]?.freshness === "stale").length };
  // 没有触发条件、没有观测、资料不齐和过期，均不能宣称设备正常。
  const status = !coverage.configured ? "unconfigured" : !coverage.observed ? "waiting"
    : coverage.missing ? "partial" : coverage.stale ? "stale" : "ready";
  const alarms: ActiveAlarmView[] = [];
  const seen = new Set<string>();
  for (const node of schema.components) {
    if (node.type !== "device-state") continue;
    const point = dataPoints[node.props.dataKey];
    if (!point || point.value !== 2) continue;
    const id = `fault:${node.props.dataKey}:2`;
    if (seen.has(id)) continue;
    seen.add(id);
    alarms.push({
      id,
      kind: "fault",
      title: "设备故障",
      deviceName: node.props.deviceName,
      detail: node.props.title,
      dataKey: node.props.dataKey,
      value: point.value,
      threshold: null,
      unit: null,
      precision: 0,
      freshness: point.freshness,
      ageMs: point.ageMs,
    });
  }
  const thresholdNodes = schema.components.filter(
    (node): node is MetricCardNode | TrendChartNode =>
      node.type === "metric-card" || node.type === "trend-chart",
  );
  for (const node of thresholdNodes) {
    const point = dataPoints[node.props.dataKey];
    if (!point || point.value === null || point.value < node.props.alarmThreshold) continue;
    const id = `threshold:${node.props.dataKey}:${node.props.alarmThreshold}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const source = thresholdNodes.find((candidate) =>
      candidate.type === "metric-card" &&
      candidate.props.dataKey === node.props.dataKey &&
      candidate.props.alarmThreshold === node.props.alarmThreshold
    ) ?? node;
    alarms.push({
      id,
      kind: "threshold",
      title: `${source.props.title}超过告警阈值`,
      deviceName: source.type === "metric-card" ? source.props.deviceName : schema.name,
      detail: source.props.dataKey,
      dataKey: source.props.dataKey,
      value: point.value,
      threshold: source.props.alarmThreshold,
      unit: source.props.unit,
      precision: source.props.precision,
      freshness: point.freshness,
      ageMs: point.ageMs,
    });
  }
  return { status, coverage, alarms };
}

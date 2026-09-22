import type { DataPointView } from "@industrial/renderer-core";

export type DeviceStateKey =
  | "waiting"
  | "running"
  | "stopped"
  | "fault"
  | "maintenance"
  | "unknown";

export interface DeviceStateView {
  key: DeviceStateKey;
  label: string;
  rawCode: number | null;
  stale: boolean;
}

const stateByCode = {
  0: { key: "stopped", label: "停止" },
  1: { key: "running", label: "运行" },
  2: { key: "fault", label: "故障" },
  3: { key: "maintenance", label: "维护" },
} as const;

export function resolveDeviceState(dataPoint: DataPointView): DeviceStateView {
  if (dataPoint.freshness === "waiting" || dataPoint.value === null) {
    return {
      key: "waiting",
      label: "等待设备状态",
      rawCode: null,
      stale: false,
    };
  }
  const state = stateByCode[dataPoint.value as keyof typeof stateByCode];
  if (!state && dataPoint.value !== null) {
    return {
      key: "unknown",
      label: `未知状态 · 状态码 ${dataPoint.value}`,
      rawCode: dataPoint.value,
      stale: dataPoint.freshness === "stale",
    };
  }
  return {
    ...state,
    rawCode: dataPoint.value,
    stale: dataPoint.freshness === "stale",
  };
}

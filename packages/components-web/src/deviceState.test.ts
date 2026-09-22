import { describe, expect, it } from "vitest";
import { resolveDeviceState } from "./deviceState";

describe("resolveDeviceState", () => {
  it.each([
    [0, "stopped", "停止"],
    [1, "running", "运行"],
    [2, "fault", "故障"],
    [3, "maintenance", "维护"],
  ] as const)("maps code %i to %s", (value, key, label) => {
    expect(resolveDeviceState({ value, freshness: "fresh", ageMs: 0 })).toEqual({
      key,
      label,
      rawCode: value,
      stale: false,
    });
  });

  it("shows an unknown state with its raw code", () => {
    expect(resolveDeviceState({ value: 9, freshness: "fresh", ageMs: 0 })).toEqual({
      key: "unknown",
      label: "未知状态 · 状态码 9",
      rawCode: 9,
      stale: false,
    });
  });

  it("shows a waiting state before the first telemetry update", () => {
    expect(resolveDeviceState({ value: null, freshness: "waiting", ageMs: null })).toEqual({
      key: "waiting",
      label: "等待设备状态",
      rawCode: null,
      stale: false,
    });
  });

  it("keeps the last device state when its data becomes stale", () => {
    expect(resolveDeviceState({ value: 2, freshness: "stale", ageMs: 5000 })).toEqual({
      key: "fault",
      label: "故障",
      rawCode: 2,
      stale: true,
    });
  });

  it("keeps an unknown raw code when its data becomes stale", () => {
    expect(resolveDeviceState({ value: 9, freshness: "stale", ageMs: 5000 })).toEqual({
      key: "unknown",
      label: "未知状态 · 状态码 9",
      rawCode: 9,
      stale: true,
    });
  });
});

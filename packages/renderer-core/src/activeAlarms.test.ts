import { describe, expect, it } from "vitest";
import { createSeedPageSchema } from "@industrial/schema";
import { resolveActiveAlarms } from "./activeAlarms";

describe("resolveActiveAlarms", () => {
  it("returns an active threshold alarm", () => {
    const schema = createSeedPageSchema();

    expect(resolveActiveAlarms(schema, {
      "pump1.outlet_temp": { value: 83, freshness: "fresh", ageMs: 0 },
    })).toEqual({
      status: "ready",
      alarms: [{
        id: "threshold:pump1.outlet_temp:80",
        kind: "threshold",
        title: "出口温度超过告警阈值",
        deviceName: "1号冷却泵",
        detail: "pump1.outlet_temp",
        dataKey: "pump1.outlet_temp",
        value: 83,
        threshold: 80,
        unit: "°C",
        precision: 1,
        freshness: "fresh",
        ageMs: 0,
      }],
    });
  });

  it("orders a device fault before a threshold alarm", () => {
    const schema = createSeedPageSchema();
    schema.components.push({
      id: "state-pump-01",
      type: "device-state",
      position: { x: 795, y: 250 },
      size: { width: 300, height: 180 },
      props: {
        deviceName: "1号冷却泵",
        title: "运行状态",
        dataKey: "pump1.operating_state",
      },
    });

    const result = resolveActiveAlarms(schema, {
      "pump1.outlet_temp": { value: 83, freshness: "fresh", ageMs: 0 },
      "pump1.operating_state": { value: 2, freshness: "fresh", ageMs: 0 },
    });

    expect(result.alarms.map((alarm) => alarm.kind)).toEqual(["fault", "threshold"]);
  });

  it("merges duplicate device fault conditions", () => {
    const schema = createSeedPageSchema();
    const stateNode = {
      id: "state-pump-01",
      type: "device-state" as const,
      position: { x: 795, y: 250 },
      size: { width: 300, height: 180 },
      props: {
        deviceName: "1号冷却泵",
        title: "运行状态",
        dataKey: "pump1.operating_state",
      },
    };
    schema.components.push(stateNode, { ...stateNode, id: "state-pump-copy" });

    const result = resolveActiveAlarms(schema, {
      "pump1.operating_state": { value: 2, freshness: "fresh", ageMs: 0 },
    });

    expect(result.alarms.filter((alarm) => alarm.kind === "fault")).toHaveLength(1);
  });

  it("uses a trend chart as an alarm source when no metric card exists", () => {
    const schema = createSeedPageSchema();
    schema.components = [{
      id: "trend-pump-01",
      type: "trend-chart",
      position: { x: 80, y: 405 },
      size: { width: 720, height: 300 },
      props: {
        title: "1号冷却泵出口温度趋势",
        dataKey: "pump1.outlet_temp",
        unit: "°C",
        precision: 1,
        alarmThreshold: 80,
      },
    }];

    const result = resolveActiveAlarms(schema, {
      "pump1.outlet_temp": { value: 83, freshness: "fresh", ageMs: 0 },
    });

    expect(result.alarms[0]).toMatchObject({
      title: "1号冷却泵出口温度趋势超过告警阈值",
      deviceName: "冷却系统监控",
      detail: "pump1.outlet_temp",
    });
  });

  it("merges the same threshold condition and prefers metric card labels", () => {
    const schema = createSeedPageSchema();
    schema.components = [{
      id: "trend-pump-01",
      type: "trend-chart",
      position: { x: 80, y: 405 },
      size: { width: 720, height: 300 },
      props: {
        title: "温度趋势",
        dataKey: "pump1.outlet_temp",
        unit: "°C",
        precision: 1,
        alarmThreshold: 80,
      },
    }, ...schema.components];

    const result = resolveActiveAlarms(schema, {
      "pump1.outlet_temp": { value: 83, freshness: "fresh", ageMs: 0 },
    });

    expect(result.alarms).toHaveLength(1);
    expect(result.alarms[0]).toMatchObject({
      title: "出口温度超过告警阈值",
      deviceName: "1号冷却泵",
    });
  });

  it("reports waiting before any alarm source has data", () => {
    const result = resolveActiveAlarms(createSeedPageSchema(), {});

    expect(result).toEqual({ status: "waiting", alarms: [] });
  });

  it("keeps an active alarm when its Data Point becomes stale", () => {
    const result = resolveActiveAlarms(createSeedPageSchema(), {
      "pump1.outlet_temp": { value: 83, freshness: "stale", ageMs: 5000 },
    });

    expect(result.alarms[0]).toMatchObject({
      freshness: "stale",
      ageMs: 5000,
      value: 83,
    });
  });

  it("removes an alarm after a fresh recovery value", () => {
    const result = resolveActiveAlarms(createSeedPageSchema(), {
      "pump1.outlet_temp": { value: 68.4, freshness: "fresh", ageMs: 0 },
    });

    expect(result).toEqual({ status: "ready", alarms: [] });
  });
});

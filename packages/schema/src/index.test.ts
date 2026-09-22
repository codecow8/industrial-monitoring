import { describe, expect, it } from "vitest";
import { createSeedPageSchema, isPageSchema, validatePageSchema } from "./index";

describe("PageSchema", () => {
  it("accepts the shared seed fixture", () => {
    expect(isPageSchema(createSeedPageSchema())).toBe(true);
  });

  it("rejects an unknown component type", () => {
    const invalid = createSeedPageSchema() as unknown as {
      components: Array<{ type: string }>;
    };
    invalid.components[0].type = "line-chart";

    const result = validatePageSchema(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.instancePath.endsWith("/type"))).toBe(true);
  });

  it("rejects metric cards smaller than the contract", () => {
    const invalid = createSeedPageSchema();
    invalid.components[0].size.width = 120;

    expect(validatePageSchema(invalid).valid).toBe(false);
  });

  it("accepts a trend chart without changing the page schema version", () => {
    const candidate = createSeedPageSchema() as unknown as {
      version: string;
      components: unknown[];
    };
    candidate.components.push({
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
    });

    expect(candidate.version).toBe("1.0.0");
    expect(validatePageSchema(candidate).valid).toBe(true);
  });

  it("accepts a device state without changing the page schema version", () => {
    const candidate = createSeedPageSchema() as unknown as {
      version: string;
      components: unknown[];
    };
    candidate.components.push({
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

    expect(candidate.version).toBe("1.0.0");
    expect(validatePageSchema(candidate).valid).toBe(true);
  });

  it("rejects a device state with an empty required property", () => {
    const candidate = createSeedPageSchema() as unknown as { components: unknown[] };
    candidate.components.push({
      id: "state-pump-01",
      type: "device-state",
      position: { x: 795, y: 250 },
      size: { width: 300, height: 180 },
      props: {
        deviceName: "1号冷却泵",
        title: "",
        dataKey: "pump1.operating_state",
      },
    });

    expect(validatePageSchema(candidate).valid).toBe(false);
  });

  it("rejects a device state too small to display its status", () => {
    const candidate = createSeedPageSchema() as unknown as { components: unknown[] };
    candidate.components.push({
      id: "state-pump-01",
      type: "device-state",
      position: { x: 795, y: 250 },
      size: { width: 200, height: 120 },
      props: {
        deviceName: "1号冷却泵",
        title: "运行状态",
        dataKey: "pump1.operating_state",
      },
    });

    expect(validatePageSchema(candidate).valid).toBe(false);
  });
});

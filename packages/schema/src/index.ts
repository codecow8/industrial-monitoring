import Ajv, { type ErrorObject } from "ajv";
import Type from "typebox";

export const metricCardNodeSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    type: Type.Literal("metric-card"),
    position: Type.Object({
      x: Type.Number(),
      y: Type.Number(),
    }),
    size: Type.Object({
      width: Type.Number({ minimum: 180 }),
      height: Type.Number({ minimum: 140 }),
    }),
    props: Type.Object({
      deviceName: Type.String({ minLength: 1 }),
      title: Type.String({ minLength: 1 }),
      dataKey: Type.String({ minLength: 1 }),
      unit: Type.String(),
      precision: Type.Integer({ minimum: 0, maximum: 3 }),
      alarmThreshold: Type.Number(),
    }),
  },
  { additionalProperties: false },
);

export const trendChartNodeSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    type: Type.Literal("trend-chart"),
    position: Type.Object({
      x: Type.Number(),
      y: Type.Number(),
    }),
    size: Type.Object({
      width: Type.Number({ minimum: 480 }),
      height: Type.Number({ minimum: 240 }),
    }),
    props: Type.Object({
      title: Type.String({ minLength: 1 }),
      dataKey: Type.String({ minLength: 1 }),
      unit: Type.String(),
      precision: Type.Integer({ minimum: 0, maximum: 3 }),
      alarmThreshold: Type.Number(),
    }),
  },
  { additionalProperties: false },
);

export const deviceStateNodeSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    type: Type.Literal("device-state"),
    position: Type.Object({
      x: Type.Number(),
      y: Type.Number(),
    }),
    size: Type.Object({
      width: Type.Number({ minimum: 240 }),
      height: Type.Number({ minimum: 160 }),
    }),
    props: Type.Object({
      deviceName: Type.String({ minLength: 1 }),
      title: Type.String({ minLength: 1 }),
      dataKey: Type.String({ minLength: 1 }),
    }),
  },
  { additionalProperties: false },
);

export const alarmListNodeSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    type: Type.Literal("alarm-list"),
    position: Type.Object({
      x: Type.Number(),
      y: Type.Number(),
    }),
    size: Type.Object({
      width: Type.Number({ minimum: 420 }),
      height: Type.Number({ minimum: 220 }),
    }),
    props: Type.Object({
      title: Type.String({ minLength: 1 }),
    }),
  },
  { additionalProperties: false },
);

export const pageSchemaModel = Type.Object(
  {
    version: Type.Literal("1.0.0"),
    id: Type.String({ minLength: 1 }),
    name: Type.String({ minLength: 1 }),
    canvas: Type.Object({
      width: Type.Number({ minimum: 320 }),
      height: Type.Number({ minimum: 240 }),
      background: Type.String(),
    }),
    components: Type.Array(
      Type.Union([
        metricCardNodeSchema,
        trendChartNodeSchema,
        deviceStateNodeSchema,
        alarmListNodeSchema,
      ]),
    ),
  },
  { $id: "PageSchemaV1", additionalProperties: false },
);

export type MetricCardNode = Type.Static<typeof metricCardNodeSchema>;
export type TrendChartNode = Type.Static<typeof trendChartNodeSchema>;
export type DeviceStateNode = Type.Static<typeof deviceStateNodeSchema>;
export type AlarmListNode = Type.Static<typeof alarmListNodeSchema>;
export type PageSchema = Type.Static<typeof pageSchemaModel>;
export type ComponentNode = PageSchema["components"][number];
export type ComponentType = ComponentNode["type"];

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(pageSchemaModel);

export function isPageSchema(input: unknown): input is PageSchema {
  return validate(input);
}

export function validatePageSchema(input: unknown): {
  valid: boolean;
  errors: ErrorObject[];
} {
  const valid = validate(input);
  return {
    valid,
    errors: valid ? [] : [...(validate.errors ?? [])],
  };
}

export function createSeedPageSchema(pageId = "demo"): PageSchema {
  return {
    version: "1.0.0",
    id: pageId,
    name: "冷却系统监控",
    canvas: {
      width: 1440,
      height: 900,
      background: "#0e1d2b",
    },
    components: [
      {
        id: "metric-pump-01",
        type: "metric-card",
        position: { x: 455, y: 250 },
        size: { width: 300, height: 214 },
        props: {
          deviceName: "1号冷却泵",
          title: "出口温度",
          dataKey: "pump1.outlet_temp",
          unit: "°C",
          precision: 1,
          alarmThreshold: 80,
        },
      },
    ],
  };
}

export function clonePageSchema(schema: PageSchema): PageSchema {
  return JSON.parse(JSON.stringify(schema)) as PageSchema;
}

import { computed, ref } from "vue";
import { defineStore } from "pinia";
import {
  clonePageSchema,
  createSeedPageSchema,
  isPageSchema,
  validatePageSchema,
  type AlarmListNode,
  type ComponentNode,
  type DeviceStateNode,
  type MetricCardNode,
  type PageSchema,
  type TrendChartNode,
} from "@industrial/schema";
import { loadPageSchema, savePageSchema } from "@/data/pageRepository";

export const useEditorDocumentStore = defineStore("editor-document", () => {
  const schema = ref<PageSchema>(createSeedPageSchema());
  const selectedId = ref<string | null>(schema.value.components[0]?.id ?? null);
  const dirty = ref(false);
  const history = ref<PageSchema[]>([clonePageSchema(schema.value)]);
  const historyIndex = ref(0);

  const selectedNode = computed(() =>
    schema.value.components.find((node) => node.id === selectedId.value) ?? null,
  );
  const canUndo = computed(() => historyIndex.value > 0);
  const canRedo = computed(() => historyIndex.value < history.value.length - 1);

  function resetHistory(): void {
    history.value = [clonePageSchema(schema.value)];
    historyIndex.value = 0;
  }

  function record(next: PageSchema): void {
    schema.value = clonePageSchema(next);
    history.value = [
      ...history.value.slice(0, historyIndex.value + 1),
      clonePageSchema(next),
    ].slice(-40);
    historyIndex.value = history.value.length - 1;
    dirty.value = true;
  }

  async function load(pageId: string): Promise<void> {
    schema.value = await loadPageSchema(pageId);
    selectedId.value = schema.value.components[0]?.id ?? null;
    dirty.value = false;
    resetHistory();
  }

  async function save(): Promise<void> {
    schema.value = await savePageSchema(schema.value);
    dirty.value = false;
  }

  type EditableProps = {
    deviceName?: string;
    title?: string;
    dataKey?: string;
    unit?: string;
    precision?: number;
    alarmThreshold?: number;
  };

  function updateSelectedProps(patch: Partial<EditableProps>): void {
    if (!selectedNode.value) return;
    const next = clonePageSchema(schema.value);
    const node = next.components.find((item) => item.id === selectedId.value);
    if (!node) return;
    if (node.type === "metric-card") {
      node.props = { ...node.props, ...patch } as MetricCardNode["props"];
    } else if (node.type === "trend-chart") {
      const { deviceName: _deviceName, ...sharedPatch } = patch;
      node.props = { ...node.props, ...sharedPatch };
    } else if (node.type === "device-state") {
      const {
        unit: _unit,
        precision: _precision,
        alarmThreshold: _alarmThreshold,
        ...deviceStatePatch
      } = patch;
      node.props = { ...node.props, ...deviceStatePatch };
    } else if (patch.title !== undefined) {
      node.props = { title: patch.title };
    }
    record(next);
  }

  function addTrendChart(): void {
    const existing = schema.value.components.find((node) => node.type === "trend-chart");
    if (existing) {
      selectedId.value = existing.id;
      return;
    }
    const next = clonePageSchema(schema.value);
    const trendChart: TrendChartNode = {
      id: "trend-pump-01",
      type: "trend-chart",
      position: { x: 80, y: 500 },
      size: { width: 720, height: 300 },
      props: {
        title: "1号冷却泵出口温度趋势",
        dataKey: "pump1.outlet_temp",
        unit: "°C",
        precision: 1,
        alarmThreshold: 80,
      },
    };
    next.components.push(trendChart);
    record(next);
    selectedId.value = trendChart.id;
  }

  function addDeviceState(): void {
    const existing = schema.value.components.find((node) => node.type === "device-state");
    if (existing) {
      selectedId.value = existing.id;
      return;
    }
    const next = clonePageSchema(schema.value);
    const deviceState: DeviceStateNode = {
      id: "state-pump-01",
      type: "device-state",
      position: { x: 795, y: 250 },
      size: { width: 300, height: 180 },
      props: {
        deviceName: "1号冷却泵",
        title: "运行状态",
        dataKey: "pump1.operating_state",
      },
    };
    next.components.push(deviceState);
    record(next);
    selectedId.value = deviceState.id;
  }

  function addAlarmList(): void {
    const existing = schema.value.components.find((node) => node.type === "alarm-list");
    if (existing) {
      selectedId.value = existing.id;
      return;
    }
    const next = clonePageSchema(schema.value);
    const alarmList: AlarmListNode = {
      id: "alarm-list-main",
      type: "alarm-list",
      position: { x: 830, y: 370 },
      size: { width: 520, height: 300 },
      props: { title: "活动告警" },
    };
    next.components.push(alarmList);
    record(next);
    selectedId.value = alarmList.id;
  }

  function removeComponent(componentId: string): void {
    const next = clonePageSchema(schema.value);
    const index = next.components.findIndex((node) => node.id === componentId);
    if (index < 0) return;
    next.components.splice(index, 1);
    record(next);
    selectedId.value = next.components[index]?.id ?? next.components[index - 1]?.id ?? null;
  }

  function updateSelectedGeometry(
    position: ComponentNode["position"],
    size: ComponentNode["size"],
  ): void {
    const next = clonePageSchema(schema.value);
    const node = next.components.find((item) => item.id === selectedId.value);
    if (!node) return;
    node.position = { ...position };
    node.size = { ...size };
    record(next);
  }

  function importFromText(text: string): void {
    const value: unknown = JSON.parse(text);
    const result = validatePageSchema(value);
    if (!result.valid || !isPageSchema(value)) {
      const first = result.errors[0];
      throw new Error(first ? `${first.instancePath || "/"} ${first.message ?? "格式错误"}` : "Schema 格式错误");
    }
    schema.value = clonePageSchema(value);
    selectedId.value = schema.value.components[0]?.id ?? null;
    dirty.value = true;
    resetHistory();
  }

  function undo(): void {
    if (!canUndo.value) return;
    historyIndex.value -= 1;
    schema.value = clonePageSchema(history.value[historyIndex.value]);
    dirty.value = true;
  }

  function redo(): void {
    if (!canRedo.value) return;
    historyIndex.value += 1;
    schema.value = clonePageSchema(history.value[historyIndex.value]);
    dirty.value = true;
  }

  return {
    schema,
    selectedId,
    selectedNode,
    dirty,
    canUndo,
    canRedo,
    load,
    save,
    updateSelectedProps,
    addTrendChart,
    addDeviceState,
    addAlarmList,
    removeComponent,
    updateSelectedGeometry,
    importFromText,
    undo,
    redo,
  };
});

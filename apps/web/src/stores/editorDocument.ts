import { computed, ref } from "vue";
import { defineStore } from "pinia";
import {
  clonePageSchema,
  createSeedPageSchema,
  isPageSchema,
  validatePageSchema,
  type MetricCardNode,
  type PageSchema,
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

  function updateMetricProps(patch: Partial<MetricCardNode["props"]>): void {
    if (!selectedNode.value) return;
    const next = clonePageSchema(schema.value);
    const node = next.components.find((item) => item.id === selectedId.value);
    if (!node) return;
    node.props = { ...node.props, ...patch };
    record(next);
  }

  function updateSelectedGeometry(
    position: MetricCardNode["position"],
    size: MetricCardNode["size"],
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
    updateMetricProps,
    updateSelectedGeometry,
    importFromText,
    undo,
    redo,
  };
});

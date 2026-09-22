<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElDialog, ElInput, ElInputNumber, ElMessage } from "element-plus";
import "element-plus/es/components/dialog/style/css";
import "element-plus/es/components/input/style/css";
import "element-plus/es/components/input-number/style/css";
import "element-plus/es/components/message/style/css";
import Moveable from "vue3-moveable";
import { PageRenderer } from "@industrial/renderer-core";
import { webComponentRegistry } from "@industrial/components-web";
import { useEditorDocumentStore } from "@/stores/editorDocument";
import UiIcon from "@/components/UiIcon.vue";
import { publishPage } from "@/data/pageRepository";

type DragEvent = {
  target: HTMLElement | SVGElement;
  transform: string;
  beforeTranslate: number[];
};

type ResizeEvent = {
  target: HTMLElement | SVGElement;
  width: number;
  height: number;
  drag: { transform: string; beforeTranslate: number[] };
};

const route = useRoute();
const router = useRouter();
const store = useEditorDocumentStore();
const canvasViewport = ref<HTMLElement | null>(null);
const selectedTarget = ref<HTMLElement | null>(null);
const moveableRef = ref<{ updateRect: () => void } | null>(null);
const importOpen = ref(false);
const importText = ref("");
const loading = ref(true);
const publishing = ref(false);
const dragStart = ref({ x: 0, y: 0 });
const dragOffset = ref<[number, number]>([0, 0]);
const resizeStart = ref({ x: 0, y: 0, width: 0, height: 0 });
const resizeResult = ref({ x: 0, y: 0, width: 0, height: 0 });
const contextMenu = ref<{ componentId: string; x: number; y: number } | null>(null);

const schemaText = computed(() => JSON.stringify(store.schema, null, 2));

const palette = [
  { name: "指标卡", icon: "chart" as const, active: true, action: undefined },
  { name: "文本", icon: "text" as const, active: false },
  { name: "折线图", icon: "line" as const, active: true, action: () => { store.addTrendChart(); syncTarget(); } },
  { name: "设备状态", icon: "device" as const, active: true, action: () => { store.addDeviceState(); syncTarget(); } },
  { name: "告警列表", icon: "bell" as const, active: false },
];

function syncTarget(): void {
  nextTick(() => {
    selectedTarget.value = canvasViewport.value?.querySelector<HTMLElement>(
      `[data-component-id="${store.selectedId}"]`,
    ) ?? null;
    nextTick(() => moveableRef.value?.updateRect());
  });
}

onMounted(async () => {
  try {
    await store.load(String(route.params.pageId));
    syncTarget();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "加载草稿失败");
  } finally {
    loading.value = false;
  }
});

watch(() => store.selectedId, syncTarget);

function updateTextProp(
  key: "deviceName" | "title" | "dataKey" | "unit",
  value: string,
): void {
  store.updateSelectedProps({ [key]: value });
}

function updateNumberProp(
  key: "precision" | "alarmThreshold",
  value: number | undefined,
): void {
  if (value === undefined || Number.isNaN(value)) return;
  store.updateSelectedProps({ [key]: value });
}

async function saveDraft(showMessage = true): Promise<boolean> {
  try {
    await store.save();
    if (showMessage) ElMessage.success("草稿已保存");
    return true;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "保存草稿失败");
    return false;
  }
}

async function preview(): Promise<void> {
  if (!(await saveDraft(false))) return;
  router.push({ name: "runtime", params: { pageId: store.schema.id } });
}

async function publishCurrentDraft(): Promise<void> {
  publishing.value = true;
  try {
    if (!(await saveDraft(false))) return;
    const published = await publishPage(store.schema.id);
    ElMessage.success(`已发布 v${published.version}`);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "发布页面失败");
  } finally {
    publishing.value = false;
  }
}

async function copySchema(): Promise<void> {
  await navigator.clipboard.writeText(schemaText.value);
  ElMessage.success("Schema 已复制");
}

function exportSchema(): void {
  const blob = new Blob([schemaText.value], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${store.schema.id}.schema.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function openImport(): void {
  importText.value = schemaText.value;
  importOpen.value = true;
}

function confirmImport(): void {
  try {
    store.importFromText(importText.value);
    importOpen.value = false;
    syncTarget();
    ElMessage.success("Schema 已导入");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "Schema 导入失败");
  }
}

function locked(name: string): void {
  ElMessage.info(`${name}将在后续任务开放`);
}

function closeContextMenu(): void {
  contextMenu.value = null;
}

function openContextMenu(event: MouseEvent): void {
  event.preventDefault();
  const target = event.target instanceof Element
    ? event.target.closest<HTMLElement>("[data-component-id]")
    : null;
  if (!target?.dataset.componentId) {
    closeContextMenu();
    return;
  }
  store.selectedId = target.dataset.componentId;
  contextMenu.value = {
    componentId: target.dataset.componentId,
    x: Math.min(event.clientX, window.innerWidth - 124),
    y: Math.min(event.clientY, window.innerHeight - 38),
  };
  syncTarget();
}

function deleteContextComponent(): void {
  if (!contextMenu.value) return;
  store.removeComponent(contextMenu.value.componentId);
  closeContextMenu();
  syncTarget();
}

function onDragStart(): void {
  const node = store.selectedNode;
  if (!node) return;
  dragStart.value = { ...node.position };
  dragOffset.value = [0, 0];
}

function onDrag(event: DragEvent): void {
  dragOffset.value = [event.beforeTranslate[0] ?? 0, event.beforeTranslate[1] ?? 0];
  event.target.style.transform = event.transform;
}

function onDragEnd(): void {
  const node = store.selectedNode;
  if (!node || !selectedTarget.value) return;
  store.updateSelectedGeometry(
    {
      x: Math.round(dragStart.value.x + dragOffset.value[0]),
      y: Math.round(dragStart.value.y + dragOffset.value[1]),
    },
    node.size,
  );
  selectedTarget.value.style.transform = "";
  syncTarget();
}

function onResizeStart(): void {
  const node = store.selectedNode;
  if (!node) return;
  resizeStart.value = { ...node.position, ...node.size };
  resizeResult.value = { ...resizeStart.value };
}

function onResize(event: ResizeEvent): void {
  const [dx = 0, dy = 0] = event.drag.beforeTranslate;
  resizeResult.value = {
    x: Math.round(resizeStart.value.x + dx),
    y: Math.round(resizeStart.value.y + dy),
    width: Math.round(event.width),
    height: Math.round(event.height),
  };
  event.target.style.width = `${event.width}px`;
  event.target.style.height = `${event.height}px`;
  event.target.style.transform = event.drag.transform;
}

function onResizeEnd(): void {
  if (!selectedTarget.value) return;
  store.updateSelectedGeometry(
    { x: resizeResult.value.x, y: resizeResult.value.y },
    { width: resizeResult.value.width, height: resizeResult.value.height },
  );
  selectedTarget.value.style.transform = "";
  syncTarget();
}
</script>

<template>
  <main class="app-shell" data-screen-label="监控画面编辑器" :aria-busy="loading" @pointerdown="closeContextMenu">
    <header class="topbar">
      <div class="topbar__identity">
        <div class="brand"><span class="brand__mark"></span><strong>工业智控平台</strong></div>
        <span class="topbar__divider"></span>
        <span class="topbar__page">监控画面编辑器</span>
        <span class="save-state"><i></i>{{ store.dirty ? "有未保存修改" : "已自动保存" }}</span>
      </div>
      <div class="topbar__actions">
        <button class="app-button app-button--secondary" type="button" :disabled="loading" @click="preview">
          <UiIcon name="play" />预览运行态
        </button>
        <button
          class="app-button app-button--publish"
          type="button"
          :disabled="loading || publishing"
          @click="publishCurrentDraft"
        >
          <UiIcon name="save" />{{ publishing ? "发布中…" : "发布版本" }}
        </button>
        <button class="app-button app-button--primary" type="button" :disabled="loading" @click="saveDraft()">
          <UiIcon name="save" />保存草稿
        </button>
      </div>
    </header>

    <div class="editor-layout">
      <aside class="palette-panel" aria-label="组件面板">
        <h2 class="panel-title">组件</h2>
        <div class="palette-list">
          <button
            v-for="item in palette"
            :key="item.name"
            class="palette-item"
            :class="{ 'palette-item--active': item.active, 'palette-item--locked': !item.active }"
            type="button"
            @click="item.active ? item.action?.() : locked(item.name)"
          >
            <UiIcon :name="item.icon" :size="23" />
            <span>{{ item.name }}</span>
            <UiIcon v-if="!item.active" class="palette-item__lock" name="lock" :size="13" />
          </button>
        </div>
        <div class="palette-note"><span></span>更多组件开发中<span></span></div>
      </aside>

      <section ref="canvasViewport" class="canvas-viewport" aria-label="编辑画布" @contextmenu="openContextMenu">
        <div class="canvas-tools">
          <button class="canvas-tool canvas-tool--active" type="button" aria-label="选择"><UiIcon name="cursor" /></button>
          <button class="canvas-tool" type="button" aria-label="撤销" :disabled="!store.canUndo" @click="store.undo"><UiIcon name="undo" /></button>
          <button class="canvas-tool" type="button" aria-label="重做" :disabled="!store.canRedo" @click="store.redo"><UiIcon name="redo" /></button>
        </div>
        <PageRenderer :schema="store.schema" :registry="webComponentRegistry" />
        <Moveable
          v-if="selectedTarget"
          ref="moveableRef"
          :target="selectedTarget"
          :draggable="true"
          :resizable="true"
          :origin="false"
          :keep-ratio="false"
          :throttle-drag="1"
          :throttle-resize="1"
          @drag-start="onDragStart"
          @drag="onDrag"
          @drag-end="onDragEnd"
          @resize-start="onResizeStart"
          @resize="onResize"
          @resize-end="onResizeEnd"
        />
      </section>

      <aside class="inspector-panel" aria-label="属性配置">
        <h2 class="panel-title">属性配置</h2>
        <section v-if="store.selectedNode" class="inspector-section">
          <div class="section-heading"><strong>基础属性</strong><code>{{ store.selectedNode.type }}</code></div>
          <div class="field-list">
            <label v-if="store.selectedNode.type === 'metric-card' || store.selectedNode.type === 'device-state'" class="field-row">
              <span>设备名称</span>
              <el-input aria-label="设备名称" :model-value="store.selectedNode.props.deviceName" @update:model-value="updateTextProp('deviceName', $event)" />
            </label>
            <label class="field-row">
              <span>{{ store.selectedNode.type === "metric-card" ? "指标标题" : store.selectedNode.type === "device-state" ? "组件标题" : "图表标题" }}</span>
              <el-input :aria-label="store.selectedNode.type === 'metric-card' ? '指标标题' : store.selectedNode.type === 'device-state' ? '组件标题' : '图表标题'" :model-value="store.selectedNode.props.title" @update:model-value="updateTextProp('title', $event)" />
            </label>
            <label class="field-row">
              <span>数据键</span>
              <el-input aria-label="数据键" :model-value="store.selectedNode.props.dataKey" @update:model-value="updateTextProp('dataKey', $event)" />
            </label>
            <label v-if="store.selectedNode.type !== 'device-state'" class="field-row">
              <span>单位</span>
              <el-input aria-label="单位" :model-value="store.selectedNode.props.unit" @update:model-value="updateTextProp('unit', $event)" />
            </label>
            <label v-if="store.selectedNode.type !== 'device-state'" class="field-row">
              <span>小数位</span>
              <el-input-number aria-label="小数位" :model-value="store.selectedNode.props.precision" :min="0" :max="3" controls-position="right" @update:model-value="updateNumberProp('precision', $event)" />
            </label>
            <label v-if="store.selectedNode.type !== 'device-state'" class="field-row">
              <span>告警阈值</span>
              <el-input-number aria-label="告警阈值" :model-value="store.selectedNode.props.alarmThreshold" controls-position="right" @update:model-value="updateNumberProp('alarmThreshold', $event)" />
            </label>
          </div>
        </section>
        <section class="inspector-section inspector-section--schema">
          <div class="schema-heading">
            <strong>Schema 预览</strong>
            <div class="schema-actions">
              <button type="button" @click="openImport"><UiIcon name="import" :size="13" />导入</button>
              <button type="button" @click="exportSchema"><UiIcon name="save" :size="13" />导出</button>
              <button type="button" @click="copySchema"><UiIcon name="copy" :size="13" />复制</button>
            </div>
          </div>
          <pre data-testid="schema-preview">{{ schemaText }}</pre>
        </section>
      </aside>

      <footer class="statusbar">
        <span>画布 <strong>{{ store.schema.canvas.width }} × {{ store.schema.canvas.height }}</strong></span>
        <span>组件 <strong>{{ store.schema.components.length }}</strong></span>
        <span class="statusbar__push">位置 <strong>X {{ store.selectedNode?.position.x }} · Y {{ store.selectedNode?.position.y }}</strong></span>
        <span>缩放 <strong>100%</strong></span>
      </footer>
    </div>

    <div
      v-if="contextMenu"
      class="component-context-menu"
      role="menu"
      aria-label="组件操作"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @pointerdown.stop
      @contextmenu.prevent
    >
      <button type="button" role="menuitem" @click="deleteContextComponent">
        <UiIcon name="trash" :size="13" />
        删除
      </button>
    </div>

    <div v-if="loading" class="loading-cover" data-testid="draft-loading" role="status">
      正在加载草稿…
    </div>

    <el-dialog v-model="importOpen" title="导入 PageSchema" width="560px" align-center>
      <p class="dialog-hint">粘贴完整 JSON。导入前会使用当前 PageSchema 合同校验。</p>
      <el-input v-model="importText" type="textarea" :rows="16" spellcheck="false" />
      <template #footer>
        <button class="dialog-button" type="button" @click="importOpen = false">取消</button>
        <button class="dialog-button dialog-button--primary" type="button" @click="confirmImport">校验并导入</button>
      </template>
    </el-dialog>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import "element-plus/es/components/message/style/css";
import { PageRenderer } from "@industrial/renderer-core";
import { webComponentRegistry } from "@industrial/components-web";
import type { PageSchema } from "@industrial/schema";
import { TelemetrySession } from "@industrial/telemetry-client";
import type { ConnectionState } from "@industrial/telemetry-client";
import type { DataPointView } from "@industrial/renderer-core";
import type { TrendSampleView } from "@industrial/renderer-core";
import { loadPublishedPage } from "@/data/pageRepository";
import UiIcon from "@/components/UiIcon.vue";

const route = useRoute();
const router = useRouter();
const schema = ref<PageSchema | null>(null);
const version = ref<number | null>(null);
const loading = ref(true);
const connection = ref<ConnectionState>("disconnected");
const telemetryRevision = ref(0);
let telemetrySession: TelemetrySession | null = null;

const connectionText = computed(() => ({
  disconnected: "实时数据已断开",
  connecting: "正在连接实时数据",
  connected: "实时数据已连接",
  reconnecting: "连接中断，正在重连",
})[connection.value]);

const dataPoints = computed<Record<string, DataPointView>>(() => {
  telemetryRevision.value;
  if (!schema.value || !telemetrySession) return {};
  return Object.fromEntries(
    schema.value.components.flatMap((node) => {
      if (!("dataKey" in node.props)) return [];
      return [[node.props.dataKey, telemetrySession?.point(node.props.dataKey)]];
    }),
  ) as Record<string, DataPointView>;
});

const trendSamples = computed<Record<string, readonly TrendSampleView[]>>(() => {
  telemetryRevision.value;
  if (!schema.value || !telemetrySession) return {};
  return Object.fromEntries(
    schema.value.components.flatMap((node) =>
      node.type === "trend-chart"
        ? [[node.props.dataKey, telemetrySession?.trendSamples(node.props.dataKey) ?? []]]
        : [],
    ),
  );
});

function websocketUrl(pageId: string): string {
  if (window.industrialDesktop?.wsOrigin) {
    return `${window.industrialDesktop.wsOrigin}/ws/telemetry/pages/${encodeURIComponent(pageId)}`;
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/telemetry/pages/${encodeURIComponent(pageId)}`;
}

onMounted(async () => {
  try {
    const published = await loadPublishedPage(String(route.params.pageId));
    schema.value = published?.schema ?? null;
    version.value = published?.version ?? null;
    if (published) {
      telemetrySession = new TelemetrySession(websocketUrl(published.pageId));
      telemetrySession.subscribe(() => {
        connection.value = telemetrySession?.connection ?? "disconnected";
        telemetryRevision.value += 1;
      });
      telemetrySession.start();
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "加载发布版本失败");
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(() => telemetrySession?.stop());
</script>

<template>
  <main class="runtime-shell" data-screen-label="运行态预览">
    <header class="runtime-topbar">
      <div class="runtime-title">
        <strong>{{ schema?.name ?? "运行态" }}</strong>
        <span>{{ version ? `发布版本 · v${version}` : "尚未发布" }}</span>
      </div>
      <div class="runtime-actions">
        <span class="runtime-state" :class="`runtime-state--${connection}`"><i></i>{{ connectionText }}</span>
        <button class="app-button app-button--secondary" type="button" @click="router.push({ name: 'editor', params: { pageId: route.params.pageId } })">
          <UiIcon name="back" />返回编辑器
        </button>
      </div>
    </header>
    <section class="runtime-viewport">
      <span class="runtime-breadcrumb">生产监控 / 冷却系统</span>
      <PageRenderer
        v-if="schema"
        :schema="schema"
        :registry="webComponentRegistry"
        :data-points="dataPoints"
        :trend-samples="trendSamples"
      />
      <div v-else-if="!loading" class="runtime-empty" role="status">
        <strong>页面尚未发布</strong>
        <span>返回编辑器保存草稿并发布版本后，运行态才会显示页面内容。</span>
      </div>
      <p class="runtime-note">运行态读取与编辑器相同的组件 Schema，但不呈现选中框、拖动手柄和属性面板。</p>
    </section>
  </main>
</template>

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
import type { ActiveAlarmView, DataPointView } from "@industrial/renderer-core";
import type { TrendSampleView } from "@industrial/renderer-core";
import { diagnoseAlarm, loadAlarmHistory, loadPublishedPage } from "@/data/pageRepository";
import type { AlarmDiagnosis, AlarmHistoryPage, DiagnosisStatement } from "@/data/pageRepository";
import UiIcon from "@/components/UiIcon.vue";
import AlarmHistoryDrawer from "@/components/AlarmHistoryDrawer.vue";

const route = useRoute();
const router = useRouter();
const schema = ref<PageSchema | null>(null);
const version = ref<number | null>(null);
const loading = ref(true);
const connection = ref<ConnectionState>("disconnected");
const telemetryRevision = ref(0);
const selectedAlarm = ref<ActiveAlarmView | null>(null);
const diagnosis = ref<AlarmDiagnosis | null>(null);
const diagnosisError = ref("");
const diagnosisLoading = ref(false);
let diagnosisRequest = 0;
const historyOpen = ref(false);
const history = ref<AlarmHistoryPage | null>(null);
const historyLoading = ref(false);
const historyLoadingMore = ref(false);
const historyError = ref("");
let historyRequest = 0;
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

async function analyzeAlarm(alarm: ActiveAlarmView): Promise<void> {
  selectedAlarm.value = alarm;
  diagnosis.value = null;
  diagnosisError.value = "";
  diagnosisLoading.value = true;
  const requestId = ++diagnosisRequest;
  try {
    const result = await diagnoseAlarm(String(route.params.pageId), alarm);
    if (requestId === diagnosisRequest) diagnosis.value = result;
  } catch (error) {
    if (requestId === diagnosisRequest) diagnosisError.value = error instanceof Error ? error.message : "分析失败";
  } finally {
    if (requestId === diagnosisRequest) diagnosisLoading.value = false;
  }
}

function closeDiagnosis(): void {
  diagnosisRequest += 1;
  selectedAlarm.value = null;
  diagnosis.value = null;
}

async function openHistory(): Promise<void> {
  historyOpen.value = true;
  history.value = null;
  historyError.value = "";
  historyLoading.value = true;
  const requestId = ++historyRequest;
  try {
    const result = await loadAlarmHistory(String(route.params.pageId));
    if (requestId === historyRequest) history.value = result;
  } catch (error) {
    if (requestId === historyRequest) historyError.value = error instanceof Error ? error.message : "加载历史告警失败";
  } finally {
    if (requestId === historyRequest) historyLoading.value = false;
  }
}

async function loadMoreHistory(): Promise<void> {
  const current = history.value;
  if (!current || current.nextOffset === null || historyLoadingMore.value) return;
  historyLoadingMore.value = true;
  const requestId = historyRequest;
  try {
    const next = await loadAlarmHistory(String(route.params.pageId), current.nextOffset, current.windowEnd);
    if (requestId === historyRequest) {
      history.value = { ...current, records: [...current.records, ...next.records], nextOffset: next.nextOffset };
    }
  } catch (error) {
    if (requestId === historyRequest) historyError.value = error instanceof Error ? error.message : "加载更多历史告警失败";
  } finally {
    if (requestId === historyRequest) historyLoadingMore.value = false;
  }
}

function closeHistory(): void {
  historyRequest += 1;
  historyOpen.value = false;
  history.value = null;
}

const selectedPoint = computed(() => selectedAlarm.value ? dataPoints.value[selectedAlarm.value.dataKey] : null);
const alarmRecovered = computed(() => selectedAlarm.value && selectedPoint.value?.value !== null &&
  (selectedAlarm.value.kind === "fault"
    ? selectedPoint.value?.value !== 2
    : (selectedPoint.value?.value ?? -Infinity) < (selectedAlarm.value.threshold ?? Infinity)));
const alarmStale = computed(() => selectedAlarm.value?.freshness === "stale" || selectedPoint.value?.freshness === "stale" || diagnosis.value?.dataFreshness.stale);

function sourceLabel(statement: DiagnosisStatement): string {
  return statement.sourceIds.map((id) => id.startsWith("observation:") ? `观测 #${id.slice(12)}` : id.startsWith("page:") ? `页面配置 v${version.value}` : "PUMP-01 §3.2").join(" · ");
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

onBeforeUnmount(() => { telemetrySession?.stop(); historyRequest += 1; });
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
        :on-analyze-alarm="analyzeAlarm"
        :on-show-alarm-history="openHistory"
      />
      <div v-else-if="!loading" class="runtime-empty" role="status">
        <strong>页面尚未发布</strong>
        <span>返回编辑器保存草稿并发布版本后，运行态才会显示页面内容。</span>
      </div>
      <p class="runtime-note">运行态读取与编辑器相同的组件 Schema，但不呈现选中框、拖动手柄和属性面板。</p>
    </section>
    <div v-if="selectedAlarm" class="diagnosis-backdrop" @mousedown.self="closeDiagnosis">
      <aside class="diagnosis-drawer" role="dialog" aria-modal="true" aria-labelledby="diagnosis-title" data-testid="diagnosis-drawer">
        <header class="diagnosis-header">
          <div class="diagnosis-header-copy"><span>辅助判断 · 只读分析</span><h2 id="diagnosis-title">告警智能分析</h2></div>
          <button class="diagnosis-close" type="button" aria-label="关闭智能分析" @click="closeDiagnosis">×</button>
        </header>
        <div class="diagnosis-scroll">
          <section class="diagnosis-alarm-summary">
            <small>当前告警 · 发布版本 v{{ diagnosis?.alarm.version ?? version }}</small>
            <strong>{{ selectedAlarm.title }}</strong>
            <span>{{ selectedAlarm.deviceName }} · {{ selectedAlarm.detail }}</span>
            <b>{{ selectedAlarm.kind === "fault" ? `状态码 ${selectedAlarm.value}` : `${selectedAlarm.value.toFixed(selectedAlarm.precision)} ${selectedAlarm.unit ?? ""}` }}</b>
          </section>
          <p v-if="alarmRecovered" class="diagnosis-notice">该告警已恢复。以下分析仅针对选中时的历史观测。</p>
          <p v-if="alarmStale" class="diagnosis-notice diagnosis-notice--stale">实时数据已过期；请先核对设备现场状态。</p>
          <div v-if="diagnosisLoading" class="diagnosis-state" role="status"><h3>正在整理告警证据</h3><p>查询遥测观测与模拟手册章节…</p></div>
          <div v-else-if="diagnosisError" class="diagnosis-state diagnosis-state--error" role="alert"><h3>暂时无法获取分析</h3><p>{{ diagnosisError }}</p><button type="button" @click="analyzeAlarm(selectedAlarm!)">重新分析</button></div>
          <template v-else-if="diagnosis">
            <div class="diagnosis-result-status" :class="{ 'diagnosis-result-status--limited': diagnosis.status === 'insufficient_evidence' }"><strong>{{ diagnosis.status === "completed" ? "已整理可核对证据" : "证据不足" }}</strong><span>{{ diagnosis.status === "completed" ? "原因仍需现场排查，不代表自动诊断结论" : "当前值可确认，触发起点与根因尚无法判断" }}</span></div>
            <section class="diagnosis-section"><h3>已观测事实</h3><div v-for="(fact, index) in diagnosis.observedFacts" :key="index" class="diagnosis-fact"><span>{{ index + 1 }}</span><p>{{ fact.text }}<small>来源：{{ sourceLabel(fact) }}</small></p></div></section>
            <section class="diagnosis-section"><h3>可能原因 <em>待核实</em></h3><p v-if="!diagnosis.possibleCauses.length">现有证据不足，不能判断根因。</p><div v-for="(cause, index) in diagnosis.possibleCauses" :key="index" class="diagnosis-hypothesis"><p>{{ cause.text }}</p><small>依据：{{ sourceLabel(cause) }}</small></div></section>
            <section class="diagnosis-section"><h3>建议现场检查</h3><p v-if="!diagnosis.recommendedChecks.length">请先核对现场设备状态并补充连续观测。</p><ol v-else><li v-for="(check, index) in diagnosis.recommendedChecks" :key="index">{{ check.text }} <small>({{ sourceLabel(check) }})</small></li></ol></section>
            <section class="diagnosis-section"><h3>证据来源</h3><details><summary>遥测观测 · {{ diagnosis.sources.filter(source => source.type === "observation").length }} 条</summary><p v-for="source in diagnosis.sources.filter(source => source.type === 'observation')" :key="source.id">#{{ source.id.slice(12) }} · {{ source.value }} · {{ source.receivedAt }}</p></details><p v-for="source in diagnosis.sources.filter(source => source.type === 'page')" :key="source.id">{{ source.title }}</p><details v-for="source in diagnosis.sources.filter(source => source.type === 'manual')" :key="source.id"><summary>{{ source.title }}</summary><p>{{ source.excerpt }}</p></details></section>
          </template>
        </div>
      </aside>
    </div>
    <AlarmHistoryDrawer
      v-if="historyOpen"
      :history="history"
      :loading="historyLoading"
      :loading-more="historyLoadingMore"
      :error="historyError"
      :on-close="closeHistory"
      :on-retry="openHistory"
      :on-load-more="loadMoreHistory"
    />
  </main>
</template>

<style scoped>
.diagnosis-backdrop { position: fixed; z-index: 40; inset: 0; display: flex; justify-content: flex-end; background: rgba(3, 10, 16, .6); }
.diagnosis-drawer { width: min(500px, 94vw); height: 100%; display: flex; flex-direction: column; color: #203445; background: #f7f9fa; box-shadow: -18px 0 48px rgba(0, 0, 0, .34); }
.diagnosis-header { min-height: 82px; display: flex; align-items: center; gap: 12px; padding: 17px 22px; background: #fff; border-bottom: 1px solid #dbe3e9; }
.diagnosis-header-copy { flex: 1; }.diagnosis-header-copy span { color: #77909f; font-size: 10px; }.diagnosis-header-copy h2 { margin: 2px 0 0; color: #1c3040; font-size: 19px; }
.diagnosis-close { width: 31px; height: 31px; color: #657e8f; background: #eef2f5; border: 0; border-radius: 3px; cursor: pointer; }
.diagnosis-scroll { overflow-y: auto; padding: 20px 22px 26px; }
.diagnosis-alarm-summary { display: grid; gap: 6px; padding: 15px 16px; color: #dcebf3; background: #162d3d; border-left: 3px solid #eaa73c; }
.diagnosis-alarm-summary small, .diagnosis-alarm-summary span { color: #9eb5c4; }.diagnosis-alarm-summary b { color: #f0c47e; font-size: 17px; }
.diagnosis-notice { padding: 9px 11px; color: #5f7180; font-size: 11px; background: #edf2f5; border-left: 2px solid #90a8b8; }.diagnosis-notice--stale { color: #815e31; background: #fbf1df; border-left-color: #eaa73c; }
.diagnosis-state { padding: 48px 12px; text-align: center; }.diagnosis-state h3 { font-size: 15px; }.diagnosis-state p { color: #657e8f; font-size: 12px; }.diagnosis-state button { padding: 7px 13px; color: #fff; background: #267a9c; border: 0; border-radius: 3px; cursor: pointer; }
.diagnosis-result-status { display: grid; gap: 4px; margin-top: 17px; padding: 11px 13px; color: #286d5b; background: #e7f5ef; border: 1px solid #c8e5d8; }.diagnosis-result-status--limited { color: #835c25; background: #fbf2e4; border-color: #eedcbd; }.diagnosis-result-status span { font-size: 10px; }
.diagnosis-section { padding: 17px 0; border-bottom: 1px solid #dfe6ea; }.diagnosis-section h3 { margin: 0 0 11px; color: #273e4e; font-size: 12px; }.diagnosis-section h3 em { color: #985f18; font-size: 10px; font-style: normal; }.diagnosis-section p, .diagnosis-section li, .diagnosis-section details { color: #536a79; font-size: 11px; line-height: 1.7; }.diagnosis-section ol { padding-left: 18px; }
.diagnosis-fact { display: grid; grid-template-columns: 24px 1fr; gap: 9px; }.diagnosis-fact > span { color: #388aa2; font-size: 11px; }.diagnosis-fact p { margin: 0 0 12px; }.diagnosis-fact small, .diagnosis-hypothesis small { display: block; color: #6b8ba0; font-size: 9px; }.diagnosis-hypothesis { padding: 12px 13px; background: #fff; border-left: 2px solid #eaa73c; }.diagnosis-hypothesis p { margin: 0 0 6px; }
</style>

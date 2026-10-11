<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad, onShow, onHide, onUnload, onReachBottom } from "@dcloudio/uni-app";
import { page, loading, error, summary, latestVersion, openRuntime, stopRuntime } from "../../data/runtime";
import { loadEvidence, loadHistory, diagnose, formatTime, type Evidence, type HistoryPage, type HistoryRecord, type Diagnosis } from "../../data/api";
import UiIcon from "../../components/UiIcon.vue";
let pageId = "demo"; let alarmId = "";
const historyMode = ref(false); const expanded = ref(false); const evidence = ref<Evidence | null>(null);
const history = ref<HistoryPage | null>(null); const selectedHistory = ref<HistoryRecord | null>(null);
const queryKind = ref<"history" | "evidence" | "analysis">("history");
const result = ref<Diagnosis | null>(null); const busy = ref(false); const queryError = ref("");
let generation = 0;
const selected = computed(() => summary.value?.alarms.find(item => item.id === alarmId));
const canAnalyze = computed(() => !!selected.value && selected.value.freshness === 'fresh' && !latestVersion.value);
const statements = computed(() => result.value ? [
  { title: '观测事实', values: result.value.observedFacts },
  { title: '可能原因', values: result.value.possibleCauses },
  { title: '建议核查', values: result.value.recommendedChecks },
] : []);
onLoad(query => { pageId = query?.pageId || "demo"; alarmId = query?.alarm ? decodeURIComponent(query.alarm) : ""; historyMode.value = query?.history === "1"; });
const target = () => `/pages/detail/index?pageId=${encodeURIComponent(pageId)}${historyMode.value ? '&history=1' : `&alarm=${encodeURIComponent(alarmId)}`}`;
async function show() {
  const current = ++generation;
  busy.value = false; queryError.value = ""; evidence.value = null; result.value = null; history.value = null; selectedHistory.value = null; expanded.value = false;
  await openRuntime(pageId, target());
  if (current === generation && historyMode.value && page.value && !error.value) await historyNext();
}
function hide() { generation++; busy.value = false; stopRuntime(); }
onShow(show); onHide(hide); onUnload(hide); onReachBottom(() => { if (historyMode.value && history.value?.nextOffset != null) void historyNext(); });
async function historyNext() {
  if (busy.value || !page.value || latestVersion.value || history.value?.nextOffset === null) return;
  const current = generation; const published = page.value; queryKind.value = "history"; busy.value = true; queryError.value = "";
  try {
    const next = await loadHistory(published, history.value?.nextOffset ?? 0, history.value?.windowEnd);
    if (current !== generation) return;
    history.value = { ...next, records: [...(history.value?.records ?? []), ...next.records] };
  } catch (cause) { if (current === generation) queryError.value = cause instanceof Error ? cause.message : '历史加载失败'; }
  finally { if (current === generation) busy.value = false; }
}
async function toggleEvidence() {
  expanded.value = !expanded.value;
  if (!expanded.value || evidence.value || busy.value || !page.value || !selected.value) return;
  const current = generation; queryKind.value = "evidence"; busy.value = true; queryError.value = "";
  try {
    const response = await loadEvidence(page.value, selected.value);
    if (current === generation) evidence.value = response;
  } catch (cause) { if (current === generation) queryError.value = cause instanceof Error ? cause.message : '依据加载失败'; }
  finally { if (current === generation) busy.value = false; }
}
async function analyze() {
  if (!canAnalyze.value || busy.value || !page.value || !selected.value) return;
  const current = generation; const published = page.value; const alarm = selected.value;
  queryKind.value = "analysis"; busy.value = true; queryError.value = ""; result.value = null;
  try {
    const response = await diagnose(published, alarm);
    if (current === generation && !latestVersion.value) result.value = response;
  } catch (cause) { if (current === generation) queryError.value = cause instanceof Error ? cause.message : '分析服务暂时不可用'; }
  finally { if (current === generation) busy.value = false; }
}
function retryQuery() {
  if (queryKind.value === "history") void historyNext();
  else if (queryKind.value === "analysis") void analyze();
  else { expanded.value = false; void toggleEvidence(); }
}
function back() { uni.reLaunch({ url: `/pages/monitor/index?pageId=${encodeURIComponent(pageId)}` }); }
</script>
<template>
  <view class="screen">
    <button class="text-button back" @tap="back">← 返回监控</button><text class="eyebrow">{{ page?.schema.name || pageId }} · 发布版本 v{{ page?.version ?? '—' }}</text>
    <text class="page-title">{{ historyMode ? '已恢复历史' : selected?.title || '告警详情' }}</text>
    <text v-if="loading" class="muted">正在核对登录与发布版本…</text><view v-if="error" class="notice">{{ error }}<button class="secondary" @tap="show">重新加载</button></view>
    <view v-if="latestVersion" class="notice">页面已发布新版本，请返回监控刷新后重试。</view>
    <template v-if="page && !loading && !error">
      <template v-if="historyMode">
        <text class="muted footnote">最近24小时 · 当前发布版本内已恢复事件</text><text v-if="history" class="muted footnote">{{ formatTime(history.windowStart) }} 至 {{ formatTime(history.windowEnd) }} · {{ history.total }}条</text>
        <button v-for="record in history?.records" :key="record.id" class="card history-record" @tap="selectedHistory = selectedHistory?.id === record.id ? null : record"><text>{{ record.title }}</text><text class="muted">{{ record.deviceName }}</text><text class="badge">已恢复</text><text class="muted">触发 {{ formatTime(record.triggeredAt) }}</text><text class="muted">恢复 {{ formatTime(record.recoveredAt) }}</text>
          <view v-if="selectedHistory?.id === record.id" class="history-evidence"><text v-for="(obs, index) in [record.trigger.from, record.trigger.to, record.recovery.from, record.recovery.to]" :key="index">#{{ obs.id }} · {{ obs.value }} {{ record.unit }} · {{ formatTime(obs.receivedAt) }}</text></view>
        </button>
        <view v-if="history?.total === 0" class="card empty">暂无可证实的完整历史记录</view><button v-if="history?.nextOffset != null" class="secondary" :disabled="busy" @tap="historyNext">加载更多</button>
      </template>
      <template v-else>
        <view v-if="selected" class="card detail-summary"><text :class="['badge', {alarm: selected.freshness === 'fresh', warning: selected.freshness === 'stale'}]">{{ selected.freshness === 'stale' ? '最后观测触发 · 已过期' : '尚未恢复' }}</text><text class="detail-number">{{ selected.value.toFixed(selected.precision) }} {{ selected.unit }}</text><text class="muted">{{ selected.kind === 'fault' ? '触发规则：设备状态为故障' : `触发规则：${selected.dataKey} ≥ ${selected.threshold} ${selected.unit}` }}</text></view>
        <view v-else class="notice">{{ summary?.status === 'waiting' ? '等待可信告警观测。' : '当前未检测到这条活动告警，可能已经恢复。' }}<text> 可返回监控查看最新状态或历史。</text></view>
        <text class="subtitle">观测依据</text><view class="card"><button class="text-button evidence-toggle" :disabled="!selected || !!latestVersion" @tap="toggleEvidence">{{ expanded ? '收起观测记录' : '查看观测记录' }}</button><template v-if="expanded"><text v-if="evidence" class="muted footnote">{{ formatTime(evidence.window.start) }} 至 {{ formatTime(evidence.window.end) }} · 服务端接收时间</text><view v-for="obs in evidence?.observations" :key="obs.id" class="observation"><text>#{{ obs.id }} · {{ obs.value }} {{ selected?.unit }}</text><text class="muted">{{ formatTime(obs.receivedAt) }}</text></view><text v-if="evidence?.observations.length === 0" class="muted">时间窗内暂无观测。</text><text v-if="evidence?.truncated" class="notice">记录超过查询上限，当前依据不完整。</text></template></view>
        <text class="subtitle"><UiIcon name="spark" /> 智能分析</text><view class="card"><text v-if="!result" class="muted">结合近期观测与模拟手册，查看异常线索和引用依据。</text><text v-if="result?.status === 'insufficient_evidence'" class="notice">证据不足，收到更多可信观测后可重试。</text><template v-if="result?.status === 'completed'"><view v-for="group in statements" :key="group.title" class="analysis-group"><text>{{ group.title }}</text><text v-for="(statement, index) in group.values" :key="index" class="statement">{{ statement.text }} [{{ statement.sourceIds.join(', ') }}]</text></view><view class="sources"><text>引用依据</text><view v-for="source in result.sources" :key="source.id" class="observation"><text>{{ source.title || source.id }}</text><text class="muted">{{ source.id }} · {{ source.excerpt ?? source.value ?? '' }} {{ source.receivedAt ? formatTime(source.receivedAt) : '' }}</text></view></view></template><button class="primary" :disabled="!canAnalyze || busy" @tap="analyze">{{ busy ? '正在核对依据…' : result ? '重新分析' : '分析这条告警' }}</button><text v-if="!canAnalyze" class="muted footnote">等待新的可信活动告警观测后再分析。</text></view>
      </template>
      <text v-if="busy" class="muted footnote">正在查询…</text><view v-if="queryError" class="notice" role="alert">{{ queryError }}<button class="secondary" :disabled="busy || (!!latestVersion) || (queryKind === 'analysis' && !canAnalyze)" @tap="retryQuery">重试查询</button></view><text class="muted footnote">{{ historyMode ? '历史仅展示可证实的触发与恢复，不推断缺失的起点。' : '分析用于模拟项目，不提供设备控制建议。' }}</text>
    </template>
  </view>
</template>
<style scoped>
.back{margin:0 0 20px;padding:0;text-align:left;}.detail-number{display:block;font-size:42px;margin:20px 0;}.detail-summary>.muted{display:block;font-size:12px;line-height:1.8;}.evidence-toggle{padding:0;text-align:left;}.observation{display:flex;flex-direction:column;gap:6px;margin-top:15px;font-size:12px;word-break:break-word;}.observation>.muted{font-size:10px;}.analysis-group{display:flex;flex-direction:column;gap:9px;margin-bottom:20px;font-size:13px;}.statement{font-size:12px;color:#adc2d1;line-height:1.8;}.sources{font-size:13px;border-top:1px solid #ffffff15;padding-top:16px;margin-bottom:20px;}.history-record{display:flex;flex-direction:column;text-align:left;gap:10px;color:#edf5fb;font-size:13px;}.history-record>.muted{font-size:11px;}.history-record>.badge{align-self:flex-start;}.history-evidence{display:flex;flex-direction:column;gap:10px;font-size:11px;color:#adc2d1;}
</style>

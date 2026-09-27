<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import type { AlarmHistoryPage, AlarmHistoryRecord, HistoryTransition } from "@/data/pageRepository";

const props = defineProps<{
  history: AlarmHistoryPage | null;
  loading: boolean;
  loadingMore: boolean;
  error: string;
  onClose: () => void;
  onRetry: () => void;
  onLoadMore: () => void;
}>();

function timeText(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date(value));
}

function stateText(value: number): string {
  return ({ 0: "停止", 1: "运行", 2: "故障", 3: "维护" } as Record<number, string>)[value] ?? "未知";
}

function transitionText(record: AlarmHistoryRecord, transition: HistoryTransition): string {
  if (record.kind === "fault") {
    return `${stateText(transition.from.value)}码 ${transition.from.value} → ${stateText(transition.to.value)}码 ${transition.to.value}`;
  }
  return `${transition.from.value.toFixed(record.precision)} → ${transition.to.value.toFixed(record.precision)} ${record.unit ?? ""}`.trim();
}

function onScroll(event: Event): void {
  const element = event.currentTarget as HTMLElement;
  if (element.scrollTop + element.clientHeight >= element.scrollHeight - 160 &&
      props.history?.nextOffset !== null && !props.loading && !props.loadingMore && !props.error) {
    props.onLoadMore();
  }
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === "Escape") props.onClose();
}

onMounted(() => window.addEventListener("keydown", onKeyDown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeyDown));
</script>

<template>
  <div class="history-backdrop" @mousedown.self="onClose">
    <aside class="history-drawer" role="dialog" aria-modal="true" aria-labelledby="history-title" data-testid="history-drawer">
      <header class="history-header">
        <div class="history-header-icon" aria-hidden="true">◷</div>
        <div class="history-header-copy"><span>运行态 · 遥测观测</span><h2 id="history-title">历史告警</h2></div>
        <button class="history-close" type="button" aria-label="关闭历史告警" @click="onClose">×</button>
      </header>
      <div class="history-scroll" @scroll="onScroll">
        <div class="history-scope"><strong>当前发布版本 · 最近 24 小时</strong><span>仅展示有前后观测可证实的触发与恢复；无基线时不推断开始时间。</span></div>
        <div v-if="loading" class="history-state" role="status"><span class="history-spinner"></span><h3>正在查询历史告警</h3><p>按观测时间整理触发与恢复记录…</p></div>
        <div v-else-if="error" class="history-state" role="alert"><span class="history-error-mark">!</span><h3>暂时无法加载历史告警</h3><p>{{ error }}</p><button type="button" @click="onRetry">重新加载</button></div>
        <div v-else-if="history?.records.length === 0" class="history-state" role="status"><span class="history-empty-mark">✓</span><h3>暂无历史告警</h3><p>最近 24 小时内没有可由相邻观测确认的告警转折。</p></div>
        <template v-else-if="history">
          <div class="history-list-heading"><strong>告警记录</strong><span>{{ history.total }} 条</span></div>
          <div class="history-records">
            <article v-for="record in history.records" :key="record.id" class="history-record">
              <div class="history-record-top"><span class="history-kind" :class="record.kind">{{ record.kind === "fault" ? "! 设备故障" : "↑ 阈值告警" }}</span><span class="history-recovered">已恢复</span></div>
              <strong>{{ record.title }}</strong>
              <span class="history-record-device">{{ record.deviceName }} · {{ record.dataKey }}</span>
              <div class="history-times">
                <div><small>触发</small><b :title="record.triggeredAt">{{ timeText(record.triggeredAt) }}</b><span>{{ transitionText(record, record.trigger) }}</span></div>
                <div><small>恢复</small><b :title="record.recoveredAt">{{ timeText(record.recoveredAt) }}</b><span>{{ transitionText(record, record.recovery) }}</span></div>
              </div>
              <details><summary>查看观测依据</summary><p>触发：#{{ record.trigger.from.id }} → #{{ record.trigger.to.id }}</p><p>恢复：#{{ record.recovery.from.id }} → #{{ record.recovery.to.id }}</p></details>
            </article>
          </div>
        </template>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.history-backdrop { position: fixed; z-index: 40; inset: 0; display: flex; justify-content: flex-end; background: rgba(3, 10, 16, .6); }
.history-drawer { width: min(540px, 94vw); height: 100%; display: flex; flex-direction: column; color: #203445; background: #f7f9fa; box-shadow: -18px 0 48px rgba(0, 0, 0, .34); }
.history-header { min-height: 82px; display: flex; align-items: center; gap: 12px; padding: 17px 22px; background: #fff; border-bottom: 1px solid #dbe3e9; }
.history-header-icon { width: 37px; height: 37px; display: grid; place-items: center; color: #178eb3; font-size: 22px; background: #e3f4f8; border: 1px solid #b8dce6; border-radius: 4px; }
.history-header-copy { flex: 1; }.history-header-copy span { color: #77909f; font-size: 10px; }.history-header-copy h2 { margin: 2px 0 0; color: #1c3040; font-size: 19px; }
.history-close { width: 31px; height: 31px; color: #657e8f; background: #eef2f5; border: 0; border-radius: 3px; cursor: pointer; }
.history-scroll { min-height: 0; flex: 1; overflow-y: auto; padding: 20px 22px 26px; }
.history-scope { display: grid; gap: 5px; padding: 13px 15px; color: #436074; background: #e9f2f6; border: 1px solid #d3e3eb; border-radius: 3px; }.history-scope strong { font-size: 11px; }.history-scope span { color: #6d899a; font-size: 10px; line-height: 1.6; }
.history-state { min-height: 330px; display: grid; align-content: center; justify-items: center; gap: 10px; text-align: center; }.history-state h3 { margin: 0; color: #29495e; font-size: 15px; }.history-state p { max-width: 300px; margin: 0; color: #748d9d; font-size: 11px; line-height: 1.65; }.history-state button { height: 32px; padding: 0 14px; color: #fff; background: #1684b0; border: 0; border-radius: 3px; cursor: pointer; }
.history-spinner { width: 30px; height: 30px; border: 3px solid #d9e7ed; border-top-color: #2d9fc2; border-radius: 50%; animation: spin 850ms linear infinite; }.history-error-mark, .history-empty-mark { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 50%; }.history-error-mark { color: #b9545c; background: #fae8e9; }.history-empty-mark { color: #3caa80; background: #e6f4ed; }
.history-list-heading { display: flex; justify-content: space-between; align-items: center; margin: 20px 0 10px; color: #294153; font-size: 12px; }.history-list-heading span { color: #79909e; font-size: 10px; }
.history-records { display: grid; gap: 10px; }.history-record { display: grid; gap: 8px; padding: 14px 15px; background: #fff; border: 1px solid #dce5ea; border-radius: 3px; }.history-record-top { display: flex; align-items: center; justify-content: space-between; }.history-kind { color: #9b641e; font-size: 10px; font-weight: 650; }.history-kind.fault { color: #af535d; }.history-recovered { padding: 3px 7px; color: #287d64; font-size: 9px; background: #e5f4ec; border-radius: 2px; }.history-record > strong { color: #223c4e; font-size: 13px; }.history-record-device { color: #79909e; font-size: 10px; }
.history-times { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 11px 0; border-top: 1px solid #e4ebef; border-bottom: 1px solid #e4ebef; }.history-times > div { display: grid; gap: 3px; }.history-times small { color: #8ba0ad; font-size: 9px; }.history-times b { color: #263f4f; font-size: 13px; }.history-times span { color: #647d8d; font-size: 10px; }
.history-record details { color: #487993; font-size: 10px; }.history-record summary { width: fit-content; cursor: pointer; }.history-record details p { margin: 6px 0 0 15px; color: #6d8898; font-size: 10px; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>

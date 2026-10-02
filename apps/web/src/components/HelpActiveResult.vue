<script setup lang="ts">
import { computed } from "vue";
import type { ActiveResult, ActiveSnapshot } from "@/data/productHelp";
import UiIcon from "./UiIcon.vue";

const props = defineProps<{ result: ActiveResult; currentVersion: number | null; pending: boolean }>();
defineEmits<{ refresh: [] }>();
const data = computed(() => props.result.data);
const changed = computed(() => data.value && props.currentVersion !== null && data.value.version !== props.currentVersion);
const time = (timestamp: string) => new Date(timestamp).toLocaleString("zh-CN", { hour12: false });
function value(alarm: ActiveSnapshot["alarms"][number]): string {
  return alarm.kind === "fault" ? `状态码 ${alarm.observation.value}` : `${alarm.observation.value.toFixed(alarm.precision)} ${alarm.unit ?? ""}`;
}
</script>

<template>
  <section class="help-history-result help-active-result" aria-label="当前活动告警查询结果">
    <div class="help-history-heading"><strong>活动告警 · 本次观测快照</strong><span v-if="data">v{{ data.version }} · {{ data.pageId }}</span></div>
    <p v-if="data" class="help-history-window">查询 {{ time(data.queriedAt) }} · 服务器观测 5 秒未更新即过期<br />仅使用本版本发布后、24 小时范围内的最新观测。</p>
    <div v-if="changed" class="help-history-notice" role="status"><strong>发布版本已变化</strong><p>这是旧版本查询结果，请重新查询当前版本。</p></div>
    <div v-if="result.status === 'not_published'" class="help-history-empty"><strong>当前页面尚未发布</strong><p>请先手动发布，再查询该版本的活动告警。</p></div>
    <div v-else-if="result.status === 'unconfigured'" class="help-history-empty"><strong>未配置告警条件</strong><p>没有可查询的条件，不代表设备正常。</p></div>
    <template v-else-if="data">
      <div class="help-history-count"><strong>已观测告警 {{ data.total }} 条</strong><span>已显示 {{ data.alarms.length }} 条 · 故障优先</span></div>
      <div class="help-active-coverage"><strong>资料覆盖 {{ data.coverage.observed }} / {{ data.coverage.configured }} 项</strong>
        <p v-if="data.coverage.missing.length">缺少观测：{{ data.coverage.missing.join('、') }}。资料不完整，不能宣称当前全部正常。</p>
        <p v-if="data.coverage.stale.length">已过期：{{ data.coverage.stale.map(item => item.dataKey).join('、') }}。最后观测触发的告警保留，当前状态需核实。</p>
        <p v-if="!data.coverage.missing.length && !data.coverage.stale.length">本次观测完整且未过期。后续变化需要手动重新查询。</p>
      </div>
      <article v-for="(alarm, index) in data.alarms" :key="alarm.id" class="help-alarm-record">
        <div class="help-alarm-title"><strong>{{ String(index + 1).padStart(2, '0') }} · {{ alarm.title }}</strong><span :class="alarm.freshness === 'stale' ? 'help-active-stale' : 'help-active-fresh'">{{ alarm.freshness === 'stale' ? '过期 · 需核实' : '本次观测触发' }}</span></div>
        <p class="help-alarm-device">{{ alarm.deviceName }} · {{ alarm.dataKey }}</p>
        <div class="help-alarm-times"><span>最后值 <strong>{{ value(alarm) }}</strong></span><span>服务器收到 <strong>{{ time(alarm.observation.receivedAt) }}</strong></span></div>
        <details><summary><UiIcon name="history" :size="12" />查看来源依据</summary><div class="help-alarm-evidence"><small>观测 #{{ alarm.observation.id }} · 当前发布版本 v{{ data.version }}</small>
          <div><strong>触发条件</strong><p>{{ alarm.kind === 'fault' ? '设备状态码 = 2' : `观测值 ≥ ${alarm.threshold} ${alarm.unit ?? ''}` }}</p></div>
          <div><strong>资料时间</strong><p>服务器收到 {{ time(alarm.observation.receivedAt) }} · 查询 {{ time(data.queriedAt) }}</p><small>不能据此推断告警开始时间或设备根因。</small></div>
        </div></details>
      </article>
      <div v-if="data.total === 0" class="help-history-empty"><strong>{{ result.status === 'ready' ? '本次观测未触发已配置条件' : '没有足够资料判断当前告警' }}</strong><p>{{ result.status === 'ready' ? '这不是对设备健康或未来状态的保证。' : '没有检出告警不等于当前没有告警。' }}</p></div>
      <p v-if="data.omitted" class="help-active-omitted">还有 {{ data.omitted }} 条未展示。本版不分页，不自动读取其余记录。</p>
    </template>
    <div class="help-history-pagination"><span>重新查询将读取新的观测快照</span><button type="button" :disabled="pending" @click="$emit('refresh')">重新查询</button></div>
    <p class="help-history-boundary">以服务器观测时间为准。只读本页，不代为操作，不推断根因。</p>
  </section>
</template>

<style scoped>
.help-active-coverage { padding: 11px 13px; border-bottom: 1px solid var(--slate-150); background: var(--paper); font-size: 11px; color: var(--slate-700); }
.help-active-coverage strong { font-size: 11px; }
.help-active-result .help-active-coverage p { margin-top: 5px; font-size: 11px; line-height: 1.7; overflow-wrap: anywhere; }
.help-active-result .help-active-stale { color: #96611c; background: #fff3df; }
.help-active-result .help-active-fresh { color: var(--blue); background: var(--paper); }
.help-active-result .help-active-omitted { padding: 12px 13px; font-size: 11px; color: var(--slate-700); }
</style>

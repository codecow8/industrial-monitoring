<script setup lang="ts">
import { computed } from "vue";
import type { HistoryResult } from "@/data/productHelp";
import type { AlarmHistoryRecord } from "@/data/pageRepository";
import UiIcon from "./UiIcon.vue";
const props = defineProps<{ history: HistoryResult; currentVersion: number | null; pending: boolean }>();
defineEmits<{ more: []; refresh: [] }>();
const data = computed(() => props.history.data);
const changed = computed(() => props.history.status === "version_changed" || (data.value && props.currentVersion !== null && data.value.version !== props.currentVersion));
function time(value: string): string { return new Date(value).toLocaleString("zh-CN", { hour12: false }); }
function value(number: number, record: AlarmHistoryRecord): string {
  return record.kind === "fault" ? `状态码 ${number}` : `${number.toFixed(Math.min(record.precision, 20))} ${record.unit ?? ""}`;
}
</script>
<template>
  <section class="help-history-result" aria-label="历史告警查询结果">
    <template v-if="data">
      <div class="help-history-heading"><strong>已恢复的历史告警</strong><span>v{{ data.version }} · {{ data.pageId }}</span></div>
      <p class="help-history-window">最近 24 小时内 · 实际范围：{{ time(data.windowStart) }} — {{ time(data.windowEnd) }}<br />受当前发布版本时间限制；截止时间固定。观测时间按服务端接收时间显示（本机时区）。</p>
    </template>
    <div v-if="changed" class="help-history-notice" role="status"><strong>发布版本已变化</strong><p>以下旧查询仅供查看，不能继续旧分页。</p><button type="button" :disabled="pending" @click="$emit('refresh')">重新查询当前版本</button></div>
    <div v-if="history.status === 'not_published'" class="help-history-empty"><strong>当前页面尚未发布</strong><p>请先手动发布，确认成功后重新查询。</p></div>
    <div v-else-if="history.status === 'empty'" class="help-history-empty"><strong>本次范围内无完整历史记录</strong><p>没有可证明触发并恢复的记录。不代表没有活动告警，尚未恢复或缺少触发依据的告警不在结果内。</p></div>
    <template v-else-if="data">
      <div class="help-history-count"><strong>共 {{ data.total }} 条</strong><span>已显示 {{ data.records.length }} 条 · 按触发时间倒序</span></div>
      <article v-for="(record, index) in data.records" :key="record.id" class="help-alarm-record">
        <div class="help-alarm-title"><strong>{{ String(index + 1).padStart(2, '0') }} · {{ record.title }}</strong><span>已恢复</span></div>
        <p class="help-alarm-device">{{ record.deviceName }} · {{ record.dataKey }}</p>
        <div class="help-alarm-times"><span>触发 <strong>{{ time(record.triggeredAt) }}</strong></span><span>恢复 <strong>{{ time(record.recoveredAt) }}</strong></span></div>
        <details><summary><UiIcon name="history" :size="12" />查看观测依据</summary><div class="help-alarm-evidence"><small>记录 {{ record.id }} · 不作为根因结论</small>
          <div><strong>触发转折</strong><p>{{ value(record.trigger.from.value, record) }} → {{ value(record.trigger.to.value, record) }}</p><small>观测 #{{ record.trigger.from.id }}（{{ time(record.trigger.from.receivedAt) }}）→ #{{ record.trigger.to.id }}（{{ time(record.trigger.to.receivedAt) }}）</small></div>
          <div><strong>恢复转折</strong><p>{{ value(record.recovery.from.value, record) }} → {{ value(record.recovery.to.value, record) }}</p><small>观测 #{{ record.recovery.from.id }}（{{ time(record.recovery.from.receivedAt) }}）→ #{{ record.recovery.to.id }}（{{ time(record.recovery.to.receivedAt) }}）</small></div>
        </div></details>
      </article>
      <div class="help-history-pagination"><span>已显示 {{ data.records.length }} / {{ data.total }}</span><button v-if="data.nextOffset !== null" type="button" :disabled="pending || !!changed" @click="$emit('more')">{{ pending ? '查询中…' : '继续查看' }}</button><strong v-else>本次结果已全部展示</strong></div>
    </template>
    <p class="help-history-boundary">仅限本页当前发布版本的已恢复记录，不查询活动告警，不推断故障原因。</p>
  </section>
</template>

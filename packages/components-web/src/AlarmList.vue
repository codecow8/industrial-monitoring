<script setup lang="ts">
import type { AlarmListNode } from "@industrial/schema";
import type { ActiveAlarmSummary, ActiveAlarmView } from "@industrial/renderer-core";

defineProps<{
  node: AlarmListNode;
  alarmSummary: ActiveAlarmSummary;
  example?: boolean;
}>();

function valueText(alarm: ActiveAlarmView): string {
  if (alarm.kind === "fault") return `状态码 ${alarm.value}`;
  return `${alarm.value.toFixed(alarm.precision)} ${alarm.unit ?? ""}`.trim();
}

function conditionText(alarm: ActiveAlarmView): string {
  if (alarm.kind === "fault") return "检测到设备故障";
  return `阈值 ≥ ${alarm.threshold?.toFixed(alarm.precision)} ${alarm.unit ?? ""}`.trim();
}

function freshnessText(alarm: ActiveAlarmView): string {
  if (alarm.freshness !== "stale") return "数据新鲜";
  return `数据已过期 · ${Math.floor((alarm.ageMs ?? 0) / 1000)}秒前`;
}
</script>

<template>
  <article class="alarm-list-card" data-testid="alarm-list">
    <header class="alarm-list-header">
      <div class="alarm-list-heading">
        <strong>{{ node.props.title }}</strong>
        <span v-if="example" class="alarm-example-badge">示例数据</span>
      </div>
      <span class="alarm-count" :class="{ active: alarmSummary.alarms.length > 0 }">
        {{ alarmSummary.alarms.length }} 条
      </span>
    </header>
    <div class="alarm-list-body">
      <div v-if="alarmSummary.status === 'waiting'" class="alarm-empty alarm-empty--waiting">
        <span class="alarm-empty-icon" aria-hidden="true">!</span>
        <strong>等待设备数据</strong>
        <span>收到相关 Data Point 后开始判断</span>
      </div>
      <div v-else-if="alarmSummary.alarms.length === 0" class="alarm-empty alarm-empty--normal">
        <span class="alarm-empty-check" aria-hidden="true">✓</span>
        <strong>当前无活动告警</strong>
        <span>所有已配置条件均处于正常状态</span>
      </div>
      <div v-else class="alarm-rows">
        <article
          v-for="alarm in alarmSummary.alarms"
          :key="alarm.id"
          class="alarm-row"
          :class="[alarm.kind, { stale: alarm.freshness === 'stale' }]"
        >
          <span class="alarm-kind-icon" aria-hidden="true">{{ alarm.kind === "fault" ? "!" : "↑" }}</span>
          <div class="alarm-row-copy">
            <strong>{{ alarm.title }}</strong>
            <span>{{ alarm.deviceName }} · {{ alarm.detail }}</span>
            <small>{{ conditionText(alarm) }}</small>
          </div>
          <div class="alarm-row-value">
            <strong>{{ valueText(alarm) }}</strong>
            <span :class="alarm.freshness === 'stale' ? 'stale' : 'fresh'">
              {{ freshnessText(alarm) }}
            </span>
          </div>
        </article>
      </div>
    </div>
  </article>
</template>

<style scoped>
.alarm-list-card { width: 100%; height: 100%; overflow: hidden; color: #eaf2f7; background: linear-gradient(145deg, #172d3e 0%, #102332 72%, #0e202d 100%); border: 1px solid rgba(89, 140, 172, 0.35); }
.alarm-list-header { height: 52px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 0 18px; border-bottom: 1px solid rgba(142, 177, 199, 0.16); }
.alarm-list-heading { min-width: 0; display: flex; align-items: center; gap: 9px; }
.alarm-list-heading strong { overflow: hidden; font-size: 15px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.alarm-example-badge { padding: 2px 6px; color: #8db8d2; font-size: 9px; background: rgba(50, 116, 153, 0.2); border: 1px solid rgba(102, 164, 198, 0.28); border-radius: 2px; white-space: nowrap; }
.alarm-count { padding: 3px 7px; color: #8ca1b0; font-size: 10px; background: rgba(95, 119, 136, 0.14); border: 1px solid rgba(121, 151, 171, 0.18); border-radius: 2px; white-space: nowrap; }
.alarm-count.active { color: #f1c982; background: rgba(155, 101, 23, 0.2); border-color: rgba(234, 167, 60, 0.26); }
.alarm-list-body { height: calc(100% - 52px); overflow-y: auto; }
.alarm-rows { padding: 8px; }
.alarm-row { min-height: 92px; display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; align-items: center; gap: 11px; padding: 12px 12px 11px; border-bottom: 1px solid rgba(137, 168, 188, 0.13); }
.alarm-row:last-child { border-bottom: 0; }
.alarm-kind-icon { width: 32px; height: 32px; display: grid; place-items: center; color: #efbd68; font-size: 16px; font-weight: 700; background: rgba(155, 101, 23, 0.2); border: 1px solid rgba(234, 167, 60, 0.26); border-radius: 50%; }
.alarm-row.fault .alarm-kind-icon { color: #ff9aa2; background: rgba(177, 48, 57, 0.2); border-color: rgba(239, 106, 114, 0.3); }
.alarm-row-copy { min-width: 0; display: grid; gap: 4px; }
.alarm-row-copy strong { overflow: hidden; color: #e8f0f5; font-size: 12px; font-weight: 640; text-overflow: ellipsis; white-space: nowrap; }
.alarm-row-copy span { overflow: hidden; color: #9eb1be; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.alarm-row-copy small { color: #708a9b; font-size: 9px; }
.alarm-row-value { display: grid; justify-items: end; gap: 7px; padding-left: 8px; }
.alarm-row-value strong { color: #efbd68; font-size: 14px; white-space: nowrap; }
.alarm-row.fault .alarm-row-value strong { color: #ff9aa2; }
.alarm-row-value span { padding: 2px 6px; font-size: 9px; border-radius: 2px; white-space: nowrap; }
.alarm-row-value span.fresh { color: #60dcb5; background: rgba(15, 133, 99, 0.17); }
.alarm-row-value span.stale { color: #d8ae68; background: rgba(133, 91, 28, 0.2); }
.alarm-row.stale { opacity: 0.62; }
.alarm-empty { height: 100%; display: grid; place-content: center; justify-items: center; gap: 7px; color: #728b9c; text-align: center; }
.alarm-empty strong { color: #aebfca; font-size: 13px; }
.alarm-empty span { font-size: 10px; }
.alarm-empty-icon, .alarm-empty-check { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 50%; }
.alarm-empty-icon { color: #7e95a5; background: rgba(105, 125, 139, 0.15); border: 1px solid rgba(145, 165, 179, 0.22); }
.alarm-empty-check { color: #59ddb4; font-size: 15px !important; background: rgba(15, 133, 99, 0.18); border: 1px solid rgba(81, 227, 181, 0.24); }
</style>

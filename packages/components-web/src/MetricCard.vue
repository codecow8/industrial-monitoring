<script setup lang="ts">
import { computed } from "vue";
import type { MetricCardNode } from "@industrial/schema";
import type { DataPointView } from "@industrial/renderer-core";

const props = defineProps<{
  node: MetricCardNode;
  dataPoint: DataPointView;
}>();

const warning = computed(
  () =>
    props.dataPoint.freshness === "fresh" &&
    props.dataPoint.value !== null &&
    props.dataPoint.value >= props.node.props.alarmThreshold,
);
const displayValue = computed(() =>
  props.dataPoint.value === null
    ? "--"
    : props.dataPoint.value.toFixed(props.node.props.precision),
);
const stateText = computed(() => {
  if (props.dataPoint.freshness === "waiting") return "等待设备数据";
  if (props.dataPoint.freshness === "stale") {
    const seconds = Math.floor((props.dataPoint.ageMs ?? 0) / 1000);
    return `数据已过期 · ${seconds}秒前`;
  }
  return warning.value ? "温度告警" : "运行正常";
});
</script>

<template>
  <article
    class="metric-card"
    :class="{ 'metric-card--stale': dataPoint.freshness === 'stale' }"
    data-testid="metric-card"
  >
    <header class="metric-card__header">
      <strong>{{ node.props.deviceName }}</strong>
      <span class="metric-card__menu" aria-hidden="true"><i></i><i></i><i></i></span>
    </header>
    <div class="metric-card__body">
      <span class="metric-card__label">{{ node.props.title }}</span>
      <div class="metric-card__value-row">
        <span class="metric-card__value">{{ displayValue }}</span>
        <span class="metric-card__unit">{{ node.props.unit }}</span>
      </div>
      <span
        class="metric-card__state"
        :class="{
          'metric-card__state--warning': warning,
          'metric-card__state--muted': dataPoint.freshness !== 'fresh',
        }"
      >
        {{ stateText }}
      </span>
    </div>
  </article>
</template>

<style scoped>
.metric-card {
  width: 100%;
  height: 100%;
  overflow: hidden;
  color: #f3f8fb;
  background: linear-gradient(145deg, #1a3041 0%, #122332 70%, #10202e 100%);
  border: 1px solid rgba(89, 140, 172, 0.35);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.3);
}

.metric-card__header {
  height: 55px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 22px;
  border-bottom: 1px solid rgba(142, 177, 199, 0.18);
}

.metric-card__header strong {
  font-size: 16px;
  font-weight: 650;
  letter-spacing: 0.015em;
}

.metric-card__menu {
  display: flex;
  gap: 4px;
}

.metric-card__menu i {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #9db0be;
}

.metric-card__body {
  padding: 17px 22px 20px;
}

.metric-card__label {
  color: #c6d5df;
  font-size: 14px;
}

.metric-card__value-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-top: 4px;
}

.metric-card__value {
  color: #36d9dc;
  font-family: "DIN Alternate", "Avenir Next Condensed", sans-serif;
  font-size: 54px;
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: 0.01em;
  text-shadow: 0 0 24px rgba(54, 217, 220, 0.14);
}

.metric-card__unit {
  color: #e7eef2;
  font-size: 20px;
  font-weight: 560;
}

.metric-card__state {
  width: fit-content;
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 9px;
  padding: 4px 9px;
  color: #51e3b5;
  font-size: 12px;
  font-weight: 610;
  background: rgba(15, 133, 99, 0.22);
  border-radius: 2px;
}

.metric-card__state::before {
  width: 7px;
  height: 7px;
  content: "";
  border-radius: 50%;
  background: #19c993;
  box-shadow: 0 0 9px rgba(25, 201, 147, 0.7);
}

.metric-card__state--warning {
  color: #ffd58d;
  background: rgba(155, 101, 23, 0.24);
}

.metric-card__state--warning::before {
  background: #eaa73c;
  box-shadow: 0 0 9px rgba(234, 167, 60, 0.66);
}

.metric-card--stale .metric-card__value,
.metric-card--stale .metric-card__unit {
  color: #758b9a;
  text-shadow: none;
}

.metric-card__state--muted {
  color: #9aabb7;
  background: rgba(116, 135, 150, 0.16);
}

.metric-card__state--muted::before {
  background: #748796;
  box-shadow: none;
}
</style>

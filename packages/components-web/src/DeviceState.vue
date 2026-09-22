<script setup lang="ts">
import { computed } from "vue";
import type { DeviceStateNode } from "@industrial/schema";
import type { DataPointView } from "@industrial/renderer-core";
import { resolveDeviceState } from "./deviceState";

const props = defineProps<{
  node: DeviceStateNode;
  dataPoint: DataPointView;
}>();

const state = computed(() => resolveDeviceState(props.dataPoint));
const stateName = computed(() => state.value.key === "waiting" ? "--" : state.value.label);
const description = computed(() => ({
  waiting: "等待设备状态",
  stopped: "设备已停止运行",
  running: "设备运行正常",
  fault: "检测到设备故障",
  maintenance: "设备处于维护模式",
  unknown: "未识别的状态码",
})[state.value.key]);
const updatedText = computed(() => {
  if (state.value.key === "waiting") return "尚未收到状态数据";
  if (state.value.stale) {
    return `状态数据已过期 · ${Math.floor((props.dataPoint.ageMs ?? 0) / 1000)}秒前`;
  }
  return "刚刚更新";
});
</script>

<template>
  <article
    class="device-state-card"
    :class="[state.key, { stale: state.stale }]"
    data-testid="device-state"
  >
    <header class="device-state-header">
      <strong>{{ node.props.deviceName }}</strong>
      <span class="device-state-menu" aria-hidden="true"><i></i><i></i><i></i></span>
    </header>
    <div class="device-state-body">
      <div class="device-state-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="7" rx="1" />
          <rect x="3" y="14" width="18" height="7" rx="1" />
          <path d="M7 7h.01M7 17h.01M11 7h7M11 17h7" />
        </svg>
      </div>
      <div class="device-state-copy">
        <span class="device-state-label">{{ node.props.title }}</span>
        <strong class="device-state-name">{{ stateName }}</strong>
        <span class="device-state-description">{{ description }}</span>
        <span class="device-state-updated">{{ updatedText }}</span>
      </div>
    </div>
  </article>
</template>

<style scoped>
.device-state-card {
  width: 100%;
  height: 100%;
  overflow: hidden;
  color: #f3f8fb;
  background: linear-gradient(145deg, #1a3041 0%, #122332 70%, #10202e 100%);
  border: 1px solid rgba(89, 140, 172, 0.35);
}

.device-state-header {
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  border-bottom: 1px solid rgba(142, 177, 199, 0.18);
}

.device-state-header strong { font-size: 15px; font-weight: 650; }
.device-state-menu { display: flex; gap: 4px; }
.device-state-menu i { width: 3px; height: 3px; border-radius: 50%; background: #9db0be; }
.device-state-body { height: calc(100% - 50px); display: flex; align-items: center; gap: 14px; padding: 14px 18px; }
.device-state-icon { width: 48px; height: 48px; display: grid; place-items: center; flex: none; color: #51e3b5; background: rgba(15, 133, 99, 0.2); border: 1px solid rgba(81, 227, 181, 0.28); border-radius: 50%; }
.device-state-icon svg { width: 26px; height: 26px; }
.device-state-copy { min-width: 0; display: grid; gap: 3px; }
.device-state-label { color: #8fa7b7; font-size: 10px; letter-spacing: 0.06em; }
.device-state-name { overflow: hidden; color: #51e3b5; font-size: 22px; font-weight: 680; line-height: 1.15; text-overflow: ellipsis; white-space: nowrap; }
.device-state-description { color: #b6c6d0; font-size: 11px; }
.device-state-updated { color: #718a9b; font-size: 9px; }
.device-state-card.stopped .device-state-icon { color: #9caeba; background: rgba(116, 135, 150, 0.16); border-color: rgba(156, 174, 186, 0.24); }
.device-state-card.stopped .device-state-name { color: #a9bac5; }
.device-state-card.fault .device-state-icon { color: #ff9aa2; background: rgba(177, 48, 57, 0.2); border-color: rgba(239, 106, 114, 0.32); }
.device-state-card.fault .device-state-name { color: #ff9aa2; }
.device-state-card.maintenance .device-state-icon { color: #efbd68; background: rgba(155, 101, 23, 0.22); border-color: rgba(234, 167, 60, 0.3); }
.device-state-card.maintenance .device-state-name { color: #efbd68; }
.device-state-card.unknown .device-state-icon,
.device-state-card.waiting .device-state-icon,
.device-state-card.stale .device-state-icon { color: #91a5b3; background: rgba(105, 125, 139, 0.15); border-color: rgba(145, 165, 179, 0.22); }
.device-state-card.unknown .device-state-name,
.device-state-card.waiting .device-state-name,
.device-state-card.stale .device-state-name { color: #9fb1be; }
.device-state-card.stale .device-state-body { opacity: 0.58; }
</style>

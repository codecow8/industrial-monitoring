<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad, onShow, onHide, onUnload, onPullDownRefresh } from "@dcloudio/uni-app";
import { page, loading, error, point, summary, connection, latestVersion, openRuntime, stopRuntime } from "../../data/runtime";
import { logout } from "../../data/auth";
import UiIcon from "../../components/UiIcon.vue";
let pageId = "demo";
const logoutError = ref(""); const leaving = ref(false);
onLoad(query => { pageId = query?.pageId || "demo"; });
const target = () => `/pages/monitor/index?pageId=${encodeURIComponent(pageId)}`;
async function refresh() { await openRuntime(pageId, target()); uni.stopPullDownRefresh(); }
onShow(refresh); onHide(stopRuntime); onUnload(stopRuntime); onPullDownRefresh(refresh);
const metrics = computed(() => page.value?.schema.components.filter(node => node.type === "metric-card") ?? []);
const devices = computed(() => page.value?.schema.components.filter(node => node.type === "device-state") ?? []);
const textBlocks = computed(() => page.value?.schema.components.filter(node => node.type === "text-block") ?? []);
const hasTrend = computed(() => page.value?.schema.components.some(node => node.type === "trend-chart"));
const stateNames: Record<number, string> = { 0: "停止", 1: "运行", 2: "故障", 3: "维护" };
const stateName = (key: string) => { const value = point(key).value; return value === null ? "等待状态" : stateNames[value] ?? `未知状态 · ${value}`; };
function observationAge(key: string) {
  const data = point(key);
  return data.freshness === "waiting" ? "尚未更新" : data.freshness === "stale" ? `数据已过期 · ${Math.floor((data.ageMs ?? 0) / 1000)}秒前` : "刚刚更新";
}
function detail(alarm?: string) { uni.navigateTo({ url: `/pages/detail/index?pageId=${encodeURIComponent(pageId)}${alarm ? `&alarm=${encodeURIComponent(alarm)}` : '&history=1'}` }); }
async function exit() {
  if (leaving.value) return;
  leaving.value = true; logoutError.value = "";
  try { await logout(); } catch (cause) { logoutError.value = cause instanceof Error ? cause.message : "退出失败，请重试。"; }
  finally { leaving.value = false; }
}
</script>
<template>
  <view class="screen">
    <text class="eyebrow">已发布监控画面 · {{ pageId }}</text><text class="page-title">{{ page?.schema.name || '监控画面' }}</text>
    <text v-if="loading" class="muted">正在核对登录与发布版本…</text>
    <view v-if="error" class="notice">{{ error }}<button class="secondary" @tap="refresh">重新加载</button></view>
    <view v-if="latestVersion" class="notice">已发布新版本 v{{ latestVersion }}，当前保留旧版观测。<button class="secondary" @tap="refresh">刷新画面</button></view>
    <template v-if="page && !loading && !error">
      <view class="connection"><view :class="['dot', { warning: connection !== 'connected' }]" /><text>{{ connection === 'connected' ? '实时数据已连接' : connection === 'reconnecting' ? '网络断开 · 正在重连' : connection === 'connecting' ? '正在连接实时数据' : '实时数据已断开' }}</text></view>
      <view v-if="summary?.coverage.stale" class="notice">{{ connection === 'connected' ? '连接正常，但没有收到新观测。' : '恢复连接后获取快照。' }}保留最后观测，不作为当前实时值。</view>
      <view v-for="node in metrics" :key="node.id" :class="['metric', { stale: point(node.props.dataKey).freshness === 'stale' }]">
        <view class="row"><text class="metric-label">{{ node.props.title }}</text><UiIcon name="device" /></view>
        <view class="number">{{ point(node.props.dataKey).value?.toFixed(node.props.precision) ?? '--' }}<text class="unit">{{ node.props.unit }}</text></view>
        <view class="metric-meta"><text>{{ point(node.props.dataKey).freshness === 'waiting' ? '等待首次观测' : point(node.props.dataKey).freshness === 'stale' ? '最后一次观测' : (point(node.props.dataKey).value ?? 0) >= node.props.alarmThreshold ? `超过阈值 ${node.props.alarmThreshold} ${node.props.unit}` : '正常范围' }}</text><text>{{ observationAge(node.props.dataKey) }}</text></view>
      </view>
      <view v-for="node in devices" :key="node.id" class="card device-row"><UiIcon name="device" /><view class="device-copy"><text>{{ node.props.deviceName }}</text><text class="device-name">{{ stateName(node.props.dataKey) }}</text><text class="muted">{{ observationAge(node.props.dataKey) }}</text></view><text :class="['badge', { warning: point(node.props.dataKey).freshness !== 'fresh' }]">{{ point(node.props.dataKey).freshness === 'stale' ? '过期' : point(node.props.dataKey).freshness === 'waiting' ? '等待' : stateName(node.props.dataKey) }}</text></view>
      <view v-for="node in textBlocks" :key="node.id" class="card" :style="{color: node.props.color, textAlign: node.props.align, fontSize: `${node.props.fontSize}px`, whiteSpace: 'pre-wrap'}">{{ node.props.content }}</view>
      <text v-if="hasTrend" class="muted footnote">此画面的趋势图请在电脑端查看。</text>
      <view class="section-title"><text>活动告警 {{ summary?.status === 'waiting' ? '—' : summary?.alarms.length ?? 0 }}</text><button class="text-button" @tap="detail()">历史</button></view>
      <button v-for="alarm in summary?.alarms" :key="alarm.id" class="alarm-row" @tap="detail(alarm.id)"><UiIcon name="bell" /><view><text>{{ alarm.title }}</text><text class="alarm-sub">{{ alarm.deviceName }} · {{ alarm.freshness === 'stale' ? '最后观测触发 · 数据已过期' : '当前观测触发 · 尚未恢复' }}</text></view><text class="chevron">›</text></button>
      <view v-if="!summary?.alarms.length" class="card empty"><UiIcon name="bell" /><text>{{ summary?.status === 'ready' ? '暂无活动告警' : summary?.status === 'unconfigured' ? '尚未配置告警条件' : '等待可信告警观测' }}</text><text class="muted">{{ summary?.status === 'ready' ? '当前观测未触发告警，可查看已恢复历史。' : '观测缺失或过期时，不宣称设备正常。' }}</text></view>
      <text class="footnote muted">发布版本 v{{ page.version }} · 页面 {{ page.pageId }}</text>
    </template>
    <text v-if="logoutError" class="error">{{ logoutError }}</text><view class="bottom-row"><text class="muted">移动监控</text><button class="text-button" :disabled="leaving" @tap="exit">退出登录</button></view>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { init, use, type ECharts } from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { TrendChartNode } from "@industrial/schema";
import type { DataPointView, TrendSampleView } from "@industrial/renderer-core";

const props = defineProps<{
  node: TrendChartNode;
  dataPoint: DataPointView;
  trendSamples?: readonly TrendSampleView[];
}>();

use([LineChart, GridComponent, MarkLineComponent, TooltipComponent, CanvasRenderer]);

const chartElement = ref<HTMLElement | null>(null);
let chart: ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;

const samples = computed(() => props.trendSamples ?? []);
const gapCount = computed(() =>
  samples.value.reduce(
    (count, sample, index) =>
      index > 0 && sample.sampledAt - samples.value[index - 1].sampledAt > 1000
        ? count + 1
        : count,
    0,
  ),
);
const waiting = computed(() => samples.value.length === 0);
const warning = computed(
  () =>
    !waiting.value &&
    props.dataPoint.freshness === "fresh" &&
    props.dataPoint.value !== null &&
    props.dataPoint.value >= props.node.props.alarmThreshold,
);
const displayValue = computed(() =>
  waiting.value || props.dataPoint.value === null
    ? "--"
    : props.dataPoint.value.toFixed(props.node.props.precision),
);
const stateText = computed(() => {
  if (waiting.value) return "等待设备数据";
  if (props.dataPoint.freshness === "stale") return "数据已过期";
  return warning.value ? "超过告警阈值" : "数据新鲜";
});

function chartData(): Array<[number, number | null]> {
  const data: Array<[number, number | null]> = [];
  for (const sample of samples.value) {
    const previous = data.at(-1);
    if (previous && sample.sampledAt - previous[0] > 1000) {
      data.push([previous[0] + 1000, null]);
    }
    data.push([sample.sampledAt, sample.value]);
  }
  return data;
}

function renderChart(): void {
  if (!chart) return;
  if (samples.value.length === 0) {
    chart.clear();
    return;
  }
  const threshold = props.node.props.alarmThreshold;
  const values = samples.value.map((sample) => sample.value);
  const dataMin = Math.min(threshold, ...values);
  const dataMax = Math.max(threshold, ...values);
  const padding = Math.max(2, (dataMax - dataMin) * 0.16);
  const data = chartData();
  const segmentSeries: Array<Record<string, unknown>> = [];
  const addSegment = (
    previous: [number, number],
    current: [number, number],
    color: string,
  ) => {
    segmentSeries.push({
      type: "line" as const,
      data: [previous, current],
      showSymbol: false,
      silent: true,
      lineStyle: { width: 2, color },
    });
  };
  data.slice(1).forEach((current, index) => {
    const previous = data[index];
    if (previous[1] === null || current[1] === null) return;
    const from: [number, number] = [previous[0], previous[1]];
    const to: [number, number] = [current[0], current[1]];
    const fromWarning = from[1] >= threshold;
    const toWarning = to[1] >= threshold;
    if (fromWarning === toWarning) {
      addSegment(from, to, fromWarning ? "#eaa73c" : "#36d9dc");
      return;
    }
    const ratio = (threshold - from[1]) / (to[1] - from[1]);
    const crossing: [number, number] = [
      from[0] + (to[0] - from[0]) * ratio,
      threshold,
    ];
    addSegment(from, crossing, fromWarning ? "#eaa73c" : "#36d9dc");
    addSegment(crossing, to, toWarning ? "#eaa73c" : "#36d9dc");
  });
  chart.setOption({
    animation: false,
    grid: { left: 52, right: 24, top: 22, bottom: 34 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "time",
      axisLine: { lineStyle: { color: "rgba(147,178,198,.28)" } },
      axisLabel: { color: "#728b9c", fontSize: 10 },
      splitLine: { show: true, lineStyle: { color: "rgba(134,166,187,.12)" } },
    },
    yAxis: {
      type: "value",
      min: dataMin - padding,
      max: dataMax + padding,
      axisLabel: {
        color: "#728b9c",
        fontSize: 10,
        formatter: (value: number) => value.toFixed(props.node.props.precision),
      },
      splitLine: { lineStyle: { color: "rgba(134,166,187,.12)" } },
    },
    series: [{
      type: "line",
      data,
      connectNulls: false,
      symbol: "circle",
      symbolSize: 6,
      lineStyle: { width: 0, opacity: 0 },
      itemStyle: {
        color: (params: { value?: [number, number | null] }) =>
          (params.value?.[1] ?? Number.NEGATIVE_INFINITY) >= threshold
            ? "#eaa73c"
            : "#36d9dc",
      },
      markLine: {
        silent: true,
        symbol: "none",
        lineStyle: { color: "#eaa73c", type: "dashed", width: 1 },
        label: {
          color: "#dca34b",
          position: "insideEndTop",
          formatter: `告警阈值 ${threshold.toFixed(props.node.props.precision)} ${props.node.props.unit}`,
        },
        data: [{ yAxis: threshold }],
      },
    }, ...segmentSeries],
  }, true);
}

watch(
  () => [props.trendSamples, props.node.props, props.dataPoint],
  () => nextTick(renderChart),
  { deep: true },
);

onMounted(() => {
  if (!chartElement.value) return;
  chart = init(chartElement.value);
  resizeObserver = new ResizeObserver(() => chart?.resize());
  resizeObserver.observe(chartElement.value);
  renderChart();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  chart?.dispose();
});
</script>

<template>
  <article
    class="trend-chart"
    :class="{ 'trend-chart--stale': dataPoint.freshness === 'stale' }"
    :aria-label="`${node.props.title}，数据缺口 ${gapCount} 处`"
    data-testid="trend-chart"
  >
    <header class="trend-chart__header">
      <div class="trend-chart__heading">
        <strong>{{ node.props.title }}</strong>
        <span>{{ node.props.dataKey }} · 最近 60 秒</span>
      </div>
      <div class="trend-chart__summary">
        <span class="trend-chart__state" :class="{ 'trend-chart__state--warning': warning }">{{ stateText }}</span>
        <span class="trend-chart__current" :class="{ 'trend-chart__current--warning': warning }">
          <strong data-testid="trend-current-value">{{ displayValue }}</strong>
          <small>{{ node.props.unit }}</small>
        </span>
      </div>
    </header>
    <div class="trend-chart__body">
      <div ref="chartElement" class="trend-chart__plot"></div>
      <div v-if="waiting" class="trend-chart__empty">
        <strong>等待设备数据</strong>
        <span>收到第一个 Trend Sample 后开始绘制</span>
      </div>
      <span v-else-if="dataPoint.freshness === 'stale'" class="trend-chart__stale">
        数据已过期 · {{ Math.floor((dataPoint.ageMs ?? 0) / 1000) }}秒前
      </span>
    </div>
  </article>
</template>

<style scoped>
.trend-chart {
  width: 100%;
  height: 100%;
  overflow: hidden;
  color: #eaf2f7;
  background: linear-gradient(145deg, #172d3e 0%, #102332 72%, #0e202d 100%);
  border: 1px solid rgba(89, 140, 172, 0.35);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
}

.trend-chart__header {
  height: 54px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 0 20px;
  border-bottom: 1px solid rgba(142, 177, 199, 0.16);
}

.trend-chart__heading { display: grid; gap: 3px; }
.trend-chart__heading strong { font-size: 15px; }
.trend-chart__heading span { color: #87a0b2; font-size: 10px; }
.trend-chart__summary { display: flex; align-items: center; gap: 16px; }
.trend-chart__state { color: #52dcb1; font-size: 10px; }
.trend-chart__state--warning { color: #efbd68; }
.trend-chart__current { display: flex; align-items: baseline; gap: 5px; }
.trend-chart__current strong { color: #36d9dc; font-size: 24px; }
.trend-chart__current--warning strong { color: #eaa73c; }
.trend-chart__current small { color: #afc0cb; font-size: 11px; }
.trend-chart__body { position: relative; height: calc(100% - 54px); }
.trend-chart__plot { width: 100%; height: 100%; }
.trend-chart__empty { position: absolute; inset: 0; display: grid; place-content: center; gap: 7px; text-align: center; background: rgba(13, 31, 44, 0.72); }
.trend-chart__empty strong { color: #b9cad5; font-size: 13px; }
.trend-chart__empty span { color: #6f8899; font-size: 10px; }
.trend-chart__stale { position: absolute; top: 12px; right: 17px; padding: 4px 8px; color: #d6aa63; font-size: 10px; background: rgba(82, 58, 22, 0.66); border: 1px solid rgba(234, 167, 60, 0.28); }
.trend-chart--stale .trend-chart__plot { opacity: 0.5; }
</style>

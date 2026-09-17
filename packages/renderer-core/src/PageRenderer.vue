<script setup lang="ts">
import type { PageSchema } from "@industrial/schema";
import type { ComponentNode } from "@industrial/schema";
import type { ComponentRegistry, DataPointView, TrendSampleView } from "./index";
import { componentNodeStyle } from "./index";

const props = defineProps<{
  schema: PageSchema;
  registry: ComponentRegistry;
  dataPoints?: Record<string, DataPointView>;
  trendSamples?: Record<string, readonly TrendSampleView[]>;
}>();

const previewPoint: DataPointView = { value: 68.4, freshness: "fresh", ageMs: 0 };
const waitingPoint: DataPointView = { value: null, freshness: "waiting", ageMs: null };

function dataPointFor(node: ComponentNode): DataPointView {
  if (props.dataPoints === undefined) return previewPoint;
  return props.dataPoints[node.props.dataKey] ?? waitingPoint;
}
</script>

<template>
  <div
    class="page-renderer"
    :style="{
      width: `${schema.canvas.width}px`,
      height: `${schema.canvas.height}px`,
      backgroundColor: schema.canvas.background,
    }"
    data-testid="page-renderer"
  >
    <div
      v-for="node in schema.components"
      :key="node.id"
      class="component-node"
      :data-component-id="node.id"
      :style="componentNodeStyle(node)"
    >
      <component
        :is="registry[node.type]"
        :node="node"
        :data-point="dataPointFor(node)"
        :trend-samples="node.type === 'trend-chart' ? (trendSamples?.[node.props.dataKey] ?? []) : undefined"
      />
    </div>
  </div>
</template>

<style scoped>
.page-renderer {
  position: relative;
  overflow: hidden;
  background-image:
    linear-gradient(rgba(101, 145, 172, 0.105) 1px, transparent 1px),
    linear-gradient(90deg, rgba(101, 145, 172, 0.105) 1px, transparent 1px),
    linear-gradient(rgba(101, 145, 172, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(101, 145, 172, 0.04) 1px, transparent 1px);
  background-size: 48px 48px, 48px 48px, 12px 12px, 12px 12px;
}

.component-node {
  position: absolute;
}
</style>

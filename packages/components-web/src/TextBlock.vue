<script setup lang="ts">
import type { TextBlockNode } from "@industrial/schema";

defineProps<{ node: TextBlockNode }>();
</script>

<template>
  <div
    class="text-block"
    data-testid="text-block"
    :style="{ fontSize: `${node.props.fontSize}px`, color: node.props.color, textAlign: node.props.align }"
  >
    <span>{{ node.props.content }}</span>
  </div>
</template>

<style scoped>
.text-block { width: 100%; height: 100%; display: flex; align-items: center; padding: 4px 8px; overflow: hidden; font-family: -apple-system, "SF Pro Text", "PingFang SC", "Noto Sans SC", sans-serif; line-height: 1.35; }
.text-block span { width: 100%; white-space: pre-wrap; overflow-wrap: anywhere; }
</style>

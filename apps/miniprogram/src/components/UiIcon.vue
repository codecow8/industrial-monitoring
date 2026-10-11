<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ name: "eye" | "eyeOff" | "device" | "bell" | "spark" }>();
const paths = {
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="m3 3 18 18M10.6 5.1A11 11 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.1 3.9M6.1 6.1A18 18 0 0 0 2 12s3.5 7 10 7a12 12 0 0 0 5.9-1.9M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  device: '<rect x="3" y="4" width="18" height="7" rx="1"/><rect x="3" y="14" width="18" height="7" rx="1"/><path d="M7 7h.01M7 17h.01M11 7h7M11 17h7"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  spark: '<path d="m12 2 1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7Z"/>',
};
const src = computed(() => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#95b6ca" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths[props.name]}</svg>`)}`);
</script>
<template><image :src="src" class="ui-icon" mode="aspectFit" aria-hidden="true" /></template>
<style scoped>.ui-icon { width: 22px; height: 22px; flex-shrink: 0; }</style>

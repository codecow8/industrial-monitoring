<script setup lang="ts">
defineProps<{
  name: "play" | "save" | "chart" | "text" | "line" | "device" | "bell" | "lock" | "copy" | "import" | "cursor" | "undo" | "redo" | "trash" | "back";
  size?: number;
}>();
</script>

<template>
  <svg
    class="ui-icon"
    :width="size ?? 16"
    :height="size ?? 16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="name === 'play'">
      <rect x="3" y="4" width="18" height="13" rx="1" />
      <path d="m10 8 5 2.5-5 2.5Z" />
      <path d="M8 21h8" />
    </template>
    <template v-else-if="name === 'save'">
      <path d="M5 3h12l2 2v16H5Z" /><path d="M8 3v6h8V3" /><path d="M8 15h8v6H8Z" />
    </template>
    <template v-else-if="name === 'chart'">
      <path d="M4 20V10M10 20V5M16 20V2M22 20H2" />
    </template>
    <template v-else-if="name === 'text'">
      <path d="M5 5h14M12 5v14M8 19h8" />
    </template>
    <template v-else-if="name === 'line'">
      <path d="M3 18 9 11l4 3 8-9M3 4v16h18" />
    </template>
    <template v-else-if="name === 'device'">
      <rect x="3" y="4" width="18" height="7" rx="1" /><rect x="3" y="14" width="18" height="7" rx="1" />
      <path d="M7 7h.01M7 17h.01M11 7h7M11 17h7" />
    </template>
    <template v-else-if="name === 'bell'">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
    </template>
    <template v-else-if="name === 'lock'">
      <rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </template>
    <template v-else-if="name === 'copy'">
      <rect x="8" y="8" width="11" height="12" rx="1" /><path d="M16 8V4H5v12h3" />
    </template>
    <template v-else-if="name === 'import'">
      <path d="M12 3v12m-4-4 4 4 4-4M5 20h14" />
    </template>
    <template v-else-if="name === 'cursor'">
      <path d="m5 3 14 8-6 2-2 6Z" />
    </template>
    <template v-else-if="name === 'undo'">
      <path d="m9 7-4 4 4 4M5 11h8a6 6 0 0 1 6 6" />
    </template>
    <template v-else-if="name === 'redo'">
      <path d="m15 7 4 4-4 4M19 11h-8a6 6 0 0 0-6 6" />
    </template>
    <template v-else-if="name === 'trash'">
      <path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6" />
    </template>
    <template v-else>
      <path d="m15 18-6-6 6-6M9 12h11" />
    </template>
  </svg>
</template>

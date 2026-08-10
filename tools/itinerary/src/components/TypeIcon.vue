<script setup lang="ts">
import type { EntryType } from "../types";

withDefaults(defineProps<{ type: EntryType; size?: number }>(), { size: 19 });
</script>

<template>
  <svg
    v-if="type === 'flight'"
    viewBox="0 0 24 24"
    :width="size"
    :height="size"
    fill="currentColor"
  >
    <path
      d="M21 15.5v-1.9l-7.6-4.6V3.8a1.4 1.4 0 0 0-2.8 0V9L3 13.6v1.9l7.6-2.3v4.9l-2.1 1.5v1.4l3.5-1 3.5 1v-1.4l-2.1-1.5v-4.9z"
    />
  </svg>

  <svg
    v-else-if="type === 'transit'"
    viewBox="0 0 24 24"
    :width="size"
    :height="size"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <rect x="5" y="3.5" width="14" height="13" rx="3" />
    <path d="M5 10h14" />
    <path d="M8.5 20.5 6.5 17M15.5 20.5 17.5 17" />
    <circle cx="9" cy="13.3" r="0.9" />
    <circle cx="15" cy="13.3" r="0.9" />
  </svg>

  <svg
    v-else-if="type === 'drive'"
    viewBox="0 0 24 24"
    :width="size"
    :height="size"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M3 15v-2.2L5 8h14l2 4.8V15" />
    <path d="M3 15h18v3h-3v-1.5H6V18H3z" />
    <circle cx="7.5" cy="15" r="1.4" />
    <circle cx="16.5" cy="15" r="1.4" />
  </svg>

  <svg
    v-else-if="type === 'lodging'"
    viewBox="0 0 24 24"
    :width="size"
    :height="size"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M3 19V6" />
    <path d="M3 11h13a5 5 0 0 1 5 5v3" />
    <path d="M3 15h18" />
    <circle cx="7.5" cy="8" r="1.6" />
  </svg>

  <svg
    v-else-if="type === 'booking'"
    viewBox="0 0 24 24"
    :width="size"
    :height="size"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M7 3v7a2 2 0 0 0 4 0V3" />
    <path d="M9 10v11" />
    <path d="M17 3c-1.5 1.5-2 3.5-2 5.5V12h4V8.5c0-2-.5-4-2-5.5z" />
    <path d="M17 12v9" />
  </svg>

  <svg
    v-else
    viewBox="0 0 24 24"
    :width="size"
    :height="size"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <rect x="4.5" y="3.5" width="15" height="17" rx="2.5" />
    <path d="M8.5 9h7M8.5 13h7M8.5 17h4" />
  </svg>
</template>

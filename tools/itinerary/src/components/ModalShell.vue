<script setup lang="ts">
withDefaults(
  defineProps<{ title: string; note?: string; width?: number; closable?: boolean }>(),
  { note: "", width: 560, closable: true },
);

const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <div class="no-print modal-scrim">
    <div class="modal-card" :style="{ maxWidth: `${width}px` }">
      <div class="modal-head">
        <div class="modal-title">{{ title }}</div>
        <div v-if="note" class="modal-note">{{ note }}</div>
        <button
          v-if="closable"
          class="btn is-outline modal-close"
          aria-label="Close"
          @click="emit('close')"
        >
          <svg
            viewBox="0 0 24 24"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <slot />

      <div class="modal-foot">
        <slot name="foot" />
      </div>
    </div>
  </div>
</template>

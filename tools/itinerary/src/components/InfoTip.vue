<script setup lang="ts">
import { ref } from "vue";

withDefaults(defineProps<{ label: string; danger?: boolean }>(), { danger: false });

const open = ref(false);
</script>

<template>
  <span class="wrap" @mouseenter="open = true" @mouseleave="open = false">
    <button
      class="dot"
      :class="{ 'is-danger': danger }"
      :aria-label="label"
      @click="open = !open"
    >
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5.5" stroke-linecap="round" />
        <circle cx="12" cy="7.6" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    </button>
    <span v-if="open" class="anchor">
      <span class="popover body"><slot /></span>
    </span>
  </span>
</template>

<style scoped>
.wrap {
  position: relative;
  display: flex;
  flex: 0 0 auto;
}

.dot {
  background: transparent;
  border: 0;
  border-radius: 7px;
  width: 30px;
  color: var(--muted);
  cursor: help;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dot:hover {
  color: var(--accent);
}

.dot.is-danger:hover {
  color: var(--danger);
}

.anchor {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 42;
  padding-top: 6px;
  display: block;
}

.body {
  width: 246px;
}
</style>

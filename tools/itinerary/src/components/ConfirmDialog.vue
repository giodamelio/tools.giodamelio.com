<script setup lang="ts">
import ModalShell from "./ModalShell.vue";

defineProps<{
  title: string;
  body: string;
  confirmLabel: string;
  error?: string;
}>();

const emit = defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
  <ModalShell :title="title" :width="460" :closable="false">
    <div class="modal-body">
      <p class="body">{{ body }}</p>
      <div v-if="error" class="error-box">{{ error }}</div>
    </div>

    <template #foot>
      <button class="btn is-outline" @click="emit('cancel')">Cancel</button>
      <button class="btn is-solid-danger" @click="emit('confirm')">
        {{ confirmLabel }}
      </button>
    </template>
  </ModalShell>
</template>

<style scoped>
.body {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
  line-height: 1.65;
}
</style>

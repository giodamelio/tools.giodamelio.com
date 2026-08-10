<script setup lang="ts">
import { computed } from "vue";
import { ENTRY_TYPES, type Entry, type EntryType } from "../types";
import { HINTS, SCHEMA } from "../lib/schema";
import ModalShell from "./ModalShell.vue";
import EntryFields from "./EntryFields.vue";
import PeoplePicker from "./PeoplePicker.vue";

const draft = defineModel<Entry>({ required: true });
const emit = defineEmits<{ close: []; commit: [] }>();

const dayLabel = computed(() => {
  if (!draft.value.start) return "";
  return new Date(`${draft.value.start.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
});

function patch(key: keyof Entry, value: string) {
  draft.value = { ...draft.value, [key]: value };
}

function pickType(type: EntryType) {
  draft.value = { ...draft.value, type };
}

const people = computed({
  get: () => draft.value.people,
  set: (next: string[]) => {
    draft.value = { ...draft.value, people: next };
  },
});
</script>

<template>
  <ModalShell title="Add an item" :note="dayLabel" :width="680" @close="emit('close')">
    <div class="modal-body wide">
      <div>
        <div class="field-label head">Type</div>
        <div class="types">
          <button
            v-for="type in ENTRY_TYPES"
            :key="type"
            class="type"
            :class="{ 'is-on': draft.type === type }"
            :title="HINTS[type]"
            @click="pickType(type)"
          >
            {{ SCHEMA[type].label }}
          </button>
        </div>
      </div>

      <EntryFields :type="draft.type" :source="draft" scope="draft" @patch="patch" />

      <div>
        <div class="field-label head">Who is on this</div>
        <PeoplePicker v-model="people" scope="draft" with-add />
      </div>
    </div>

    <template #foot>
      <button class="btn is-outline" @click="emit('close')">Cancel</button>
      <button class="btn is-primary" @click="emit('commit')">Add item</button>
    </template>
  </ModalShell>
</template>

<style scoped>
.wide {
  gap: 18px;
}

.head {
  margin-bottom: 8px;
}

.types {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.type {
  font-size: 13px;
  background: transparent;
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 13px;
  cursor: pointer;
  white-space: nowrap;
}

.type:hover {
  border-color: var(--accent);
}

.type.is-on {
  background: color-mix(in oklab, var(--accent) 14%, transparent);
  border-color: var(--accent);
  color: var(--accent);
}
</style>

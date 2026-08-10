<script setup lang="ts">
import { computed } from "vue";
import type { Entry, EntryType } from "../types";
import { SCHEMA, type FieldSpec } from "../lib/schema";
import { localZone } from "../lib/time";
import WhenField from "./WhenField.vue";

const props = defineProps<{ type: EntryType; source: Partial<Entry>; scope: string }>();
const emit = defineEmits<{ patch: [key: keyof Entry, value: string] }>();

const fields = computed(() => SCHEMA[props.type].fields);

/* A time with no zone of its own belongs where the entry starts; a brand new
   entry belongs where you are. */
function zoneFor(field: Extract<FieldSpec, { kind: "when" }>): string {
  return props.source[field.zoneKey] || props.source.startTz || localZone();
}

function onText(event: Event, key: keyof Entry) {
  emit("patch", key, (event.target as HTMLInputElement).value);
}
</script>

<template>
  <div class="fields">
    <label v-for="field in fields" :key="field.key" class="field-label">
      {{ field.label }}
      <input
        v-if="field.kind === 'text'"
        class="text-input field-input"
        :value="source[field.key] ?? ''"
        @input="onText($event, field.key)"
      />
      <WhenField
        v-else
        :picker-id="`${scope}:${field.key}`"
        :value="source[field.key] ?? ''"
        :zone="zoneFor(field)"
        @update:value="emit('patch', field.key, $event)"
        @update:zone="emit('patch', field.zoneKey, $event)"
      />
    </label>
  </div>
</template>

<style scoped>
.fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(238px, 1fr));
  gap: 12px 14px;
}

.field-input {
  margin-top: 3px;
}
</style>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { Entry, SmartAction } from "../types";
import {
  actionPeople,
  actionSource,
  actionType,
  describeAction,
  withField,
  withPeople,
} from "../lib/smart";
import { useTripStore } from "../stores/trip";
import EntryFields from "./EntryFields.vue";
import PeoplePicker from "./PeoplePicker.vue";

const action = defineModel<SmartAction>({ required: true });
const emit = defineEmits<{ drop: [] }>();

const trip = useTripStore();
const open = ref(false);

const KIND_LABELS: Record<SmartAction["kind"], string> = {
  add: "New item",
  update: "Change item",
  people: "Change item",
  delete: "Remove item",
};

const described = computed(() => describeAction(action.value, trip.entries));
const removes = computed(() => action.value.kind === "delete");
const editable = computed(() => action.value.kind !== "delete");
const hasFields = computed(() => action.value.kind !== "people");

const people = computed({
  get: () => actionPeople(action.value),
  set: (next: string[]) => {
    action.value = withPeople(action.value, next);
  },
});

function patch(key: keyof Entry, value: string) {
  action.value = withField(action.value, key, value);
}
</script>

<template>
  <div class="action" :class="{ 'is-removal': removes }">
    <div class="head">
      <span class="kind">{{ KIND_LABELS[action.kind] }}</span>
      <span class="summary">{{ described.summary }}</span>
      <span class="tools">
        <button
          v-if="editable"
          class="btn is-outline is-tiny"
          title="Edit this change"
          @click="open = !open"
        >
          <svg
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            stroke-width="1.9"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
            <path d="M14.5 6.5l3 3" />
          </svg>
        </button>
        <button class="btn is-danger is-tiny" title="Discard this change" @click="emit('drop')">
          <svg
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            stroke-width="1.9"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M4 6.5h16" />
            <path d="M9.5 6.5V4.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.7" />
            <path d="M6.5 6.5 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.5" />
            <path d="M10.5 10v6.5M13.5 10v6.5" />
          </svg>
        </button>
      </span>
    </div>

    <div class="detail">{{ described.detail }}</div>

    <div v-if="open" class="editor">
      <EntryFields
        v-if="hasFields"
        :type="actionType(action, trip.entries)"
        :source="actionSource(action)"
        :scope="`action:${action.aid}`"
        @patch="patch"
      />
      <div>
        <div class="field-label who-head">Who is on this</div>
        <PeoplePicker v-model="people" :scope="`action:${action.aid}`" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.action {
  --input-bg: var(--bg);
  border: 1px solid var(--border);
  background: var(--card);
  border-radius: 10px;
  padding: 12px 14px;
}

.action.is-removal {
  border-color: var(--danger);
  background: color-mix(in oklab, var(--danger) 8%, transparent);
}

.head {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.kind {
  flex: 0 0 auto;
  font-size: 10px;
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 6px;
  white-space: nowrap;
}

.is-removal .kind {
  color: var(--danger);
  border-color: var(--danger);
}

.summary {
  font-size: 14px;
  font-weight: 550;
  flex: 1 1 auto;
  min-width: 0;
}

.tools {
  flex: 0 0 auto;
  display: flex;
  gap: 5px;
}

.detail {
  font-size: 12px;
  color: var(--muted);
  margin-top: 3px;
}

.editor {
  margin-top: 12px;
  border-top: 1px solid var(--border);
  padding-top: 12px;
  display: grid;
  gap: 12px;
}

.who-head {
  margin-bottom: 7px;
}
</style>

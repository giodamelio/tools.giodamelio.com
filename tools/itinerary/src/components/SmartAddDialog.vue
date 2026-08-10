<script setup lang="ts">
import { computed, ref } from "vue";
import type { SmartAction } from "../types";
import { requestActions, smartPrompt } from "../lib/openrouter";
import { todayIso } from "../lib/time";
import { useTripStore } from "../stores/trip";
import { useSettingsStore } from "../stores/settings";
import ModalShell from "./ModalShell.vue";
import SmartActionRow from "./SmartActionRow.vue";

const emit = defineEmits<{ close: [] }>();

const trip = useTripStore();
const settings = useSettingsStore();

const text = ref("");
const note = ref("");
const busy = ref(false);
const error = ref("");
const actions = ref<SmartAction[] | null>(null);

const status = computed(() => {
  if (busy.value) return "Reading…";
  return actions.value?.length ? "Review the proposed changes" : "";
});

const applyLabel = computed(() => {
  const count = actions.value?.length ?? 0;
  return `Apply ${count} change${count === 1 ? "" : "s"}`;
});

async function run() {
  if (busy.value) return;

  const key = settings.apiKey.trim();
  if (!key) {
    error.value = "Add an OpenRouter API key in Settings first.";
    return;
  }
  if (!text.value.trim() && !note.value.trim()) {
    error.value = "Paste some text to work from.";
    return;
  }

  busy.value = true;
  error.value = "";
  try {
    actions.value = await requestActions({
      apiKey: key,
      model: settings.model,
      prompt: smartPrompt(trip.entries, trip.rosterNames, text.value, note.value, todayIso()),
      knownIds: trip.entries.map((e) => e.id),
    });
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}

function drop(aid: string) {
  actions.value = (actions.value ?? []).filter((a) => a.aid !== aid);
}

function apply() {
  trip.applyActions(actions.value ?? []);
  emit("close");
}
</script>

<template>
  <ModalShell title="Smart Add" :note="status" :width="720" @close="emit('close')">
    <div class="modal-body body">
      <div v-if="busy" class="veil">
        <span class="spinner" />
        <span class="veil-note">
          Reading your text and working out what changes to propose…
        </span>
      </div>

      <div v-if="!actions?.length" class="paste">
        <p class="prose">
          Paste a confirmation email, a booking summary, or a few lines of plain notes. Nothing
          is changed until you review what it suggests.
        </p>
        <textarea v-model="text" class="text-input" rows="10" placeholder="Paste here…" />
      </div>

      <div v-else class="review">
        <SmartActionRow
          v-for="(action, i) in actions"
          :key="action.aid"
          :model-value="action"
          @update:model-value="actions[i] = $event"
          @drop="drop(action.aid)"
        />

        <div class="correction">
          <label class="block">
            <span class="correction-head">Not quite right?</span>
            <textarea
              v-model="note"
              class="text-input small"
              rows="2"
              placeholder="e.g. the return flight is for Kirsten only"
            />
          </label>
          <button class="btn is-tinted rerun" @click="run">Run again with this note</button>
        </div>
      </div>

      <div v-if="error && !busy" class="error-box">{{ error }}</div>
    </div>

    <template #foot>
      <button class="btn is-outline" @click="emit('close')">Cancel</button>
      <button v-if="actions?.length" class="btn is-primary" @click="apply">
        {{ applyLabel }}
      </button>
      <button v-else class="btn is-primary" @click="run">Extract changes</button>
    </template>
  </ModalShell>
</template>

<style scoped>
.body {
  position: relative;
}

/* Over the body only: the header keeps saying what is happening and the footer
   keeps its way out. */
.veil {
  position: absolute;
  inset: 0;
  z-index: 2;
  background: color-mix(in oklab, var(--bg) 82%, transparent);
  backdrop-filter: blur(1.5px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  border-radius: 0 0 14px 14px;
}

.veil-note {
  font-size: 13px;
  color: var(--muted);
}

.paste,
.review {
  display: grid;
  gap: 10px;
}

.prose {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
  line-height: 1.6;
}

.correction {
  margin-top: 8px;
  border-top: 1px solid var(--rule);
  padding-top: 14px;
}

.block {
  display: block;
}

.correction-head {
  display: block;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 6px;
}

.small {
  border-radius: 8px;
  padding: 9px 11px;
  line-height: 1.5;
}

.rerun {
  margin-top: 8px;
  background: transparent;
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 400;
  border-radius: 8px;
}
</style>

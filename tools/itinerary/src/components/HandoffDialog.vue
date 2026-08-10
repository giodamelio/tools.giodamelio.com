<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useTripStore } from "../stores/trip";
import { agentPromptFor } from "../lib/agent";
import { agentExpiryLabel } from "../lib/time";
import { copyText } from "../lib/share";
import { LLM_DOC } from "../router";
import ModalShell from "./ModalShell.vue";

const emit = defineEmits<{ close: [] }>();

const trip = useTripStore();
const copied = ref(false);

onMounted(() => void trip.mintKeyForAgent());

const prompt = computed(() =>
  trip.agentKey && trip.blobId
    ? agentPromptFor(trip.blobId, trip.agentKey.key, trip.agentKey.expires_at)
    : "",
);

const expiry = computed(() =>
  trip.agentKey ? agentExpiryLabel(trip.agentKey.expires_at) : "",
);

async function copy() {
  if (!prompt.value) return;
  await copyText(prompt.value);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1600);
}
</script>

<template>
  <ModalShell title="Hand off to an assistant" :width="640" @close="emit('close')">
    <div class="modal-body">
      <div v-if="trip.agentBusy" class="waiting">
        <span class="spinner is-small" />
        Setting up the assistant…
      </div>

      <template v-else-if="trip.agentKey">
        <p class="prose">
          Copy this and paste it into ChatGPT, Claude, or any other assistant. It can change
          this itinerary until <strong>{{ expiry }}</strong
          >, then it loses access.
        </p>
        <textarea readonly class="text-input prompt" rows="10" :value="prompt" />
        <p class="prose">
          Leave this tab alone while the assistant works — editing here would save over its
          changes. Reload the page when it is done to see them.
        </p>
      </template>

      <div v-if="trip.agentError && !trip.agentBusy" class="error-box is-row">
        <span class="why">{{ trip.agentError }}</span>
        <button class="btn is-danger retry" @click="trip.mintKeyForAgent">Try again</button>
      </div>

      <div class="links">
        <a :href="LLM_DOC" target="_blank" rel="noreferrer">
          How an assistant reads this itinerary
        </a>
      </div>
    </div>

    <template #foot>
      <button class="btn is-outline" @click="emit('close')">Close</button>
      <button v-if="trip.agentKey && !trip.agentBusy" class="btn is-primary" @click="copy">
        {{ copied ? "Copied" : "Copy prompt" }}
      </button>
    </template>
  </ModalShell>
</template>

<style scoped>
.waiting {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 180px;
  justify-content: center;
  color: var(--muted);
  font-size: 13px;
}

.prose {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
  line-height: 1.6;
}

.prose strong {
  color: var(--fg);
  font-weight: 600;
}

.prompt {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 1.55;
}

.why {
  min-width: 0;
}

.retry {
  margin-left: auto;
  border-radius: 7px;
  padding: 4px 12px;
  font-size: 12px;
}

.links {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 12px;
}
</style>

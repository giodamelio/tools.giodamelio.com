<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { Invite } from "../types";
import { useLibraryStore } from "../stores/library";
import { mintInvite } from "../lib/keeper";
import { copyText } from "../lib/share";
import { inviteUrl } from "../router";
import ModalShell from "./ModalShell.vue";

const props = defineProps<{ id: string }>();
const emit = defineEmits<{ close: [] }>();

const library = useLibraryStore();

const invite = ref<Invite | null>(null);
const busy = ref(false);
const error = ref("");
const copied = ref(false);

const link = computed(() => (invite.value ? inviteUrl(props.id, invite.value.invite) : ""));

/* One invite per opening of the dialog. Each is single-use, so reusing one
   across openings would hand the same link to two people and strand one. */
async function mint() {
  busy.value = true;
  error.value = "";
  try {
    invite.value = await mintInvite(props.id, library.keyFor(props.id));
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    error.value = `Could not make an invite — ${why}.`;
  } finally {
    busy.value = false;
  }
}

onMounted(() => void mint());

async function copy() {
  if (!link.value) return;
  await copyText(link.value);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1600);
}
</script>

<template>
  <ModalShell title="Invite Editor" @close="emit('close')">
    <div class="modal-body">
      <div v-if="busy" class="waiting">
        <span class="spinner is-small" />
        Making the invite…
      </div>

      <template v-else-if="invite">
        <p class="prose">This link can be used once and expires in 24 hours.</p>
        <input
          readonly
          class="text-input link"
          :value="link"
          @focus="($event.target as HTMLInputElement).select()"
        />
        <p class="prose">
          The person who opens it gets full access, including deleting the itinerary. This
          cannot be undone.
        </p>
      </template>

      <div v-if="error && !busy" class="error-box is-row">
        <span class="why">{{ error }}</span>
        <button class="btn is-danger retry" @click="mint">Try again</button>
      </div>
    </div>

    <template #foot>
      <button class="btn is-outline" @click="emit('close')">Close</button>
      <button v-if="invite && !busy" class="btn is-primary" @click="copy">
        {{ copied ? "Copied" : "Copy link" }}
      </button>
    </template>
  </ModalShell>
</template>

<style scoped>
.waiting {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 120px;
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

.link {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
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
</style>

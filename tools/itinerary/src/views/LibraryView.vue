<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import type { LibraryItem } from "../types";
import { useLibraryStore } from "../stores/library";
import { useSettingsStore } from "../stores/settings";
import { createBlob, deleteBlob } from "../lib/keeper";
import { emptyDoc, UNTITLED } from "../lib/doc";
import { tripPath } from "../router";
import LibraryRow from "../components/LibraryRow.vue";
import ConfirmDialog from "../components/ConfirmDialog.vue";

const DEMO_ID = "3pwsf4hhwx5n6s";

const router = useRouter();
const library = useLibraryStore();
const settings = useSettingsStore();

const creating = ref(false);
const createError = ref("");

interface Removal {
  id: string;
  title: string;
  mode: "forget" | "delete";
}

const pending = ref<Removal | null>(null);
const removing = ref(false);
const removalError = ref("");

onMounted(() => void library.refresh());

async function createItinerary() {
  if (creating.value) return;
  creating.value = true;
  createError.value = "";

  const doc = emptyDoc();
  try {
    const created = await createBlob(doc);
    library.remember(created.id, {
      role: "owner",
      key: created.edit_key,
      title: doc.title,
      created: created.created_at,
      modified: created.created_at,
    });
    await router.push(tripPath(created.id, true));
  } catch (err) {
    creating.value = false;
    const why = err instanceof Error ? err.message : String(err);
    createError.value = `Could not create an itinerary — ${why}.`;
  }
}

function ask(item: LibraryItem, mode: "forget" | "delete") {
  removalError.value = "";
  pending.value = { id: item.id, title: item.title || UNTITLED, mode };
}

const removalTitle = computed(() =>
  pending.value?.mode === "delete" ? "Delete it for everyone?" : "Forget it on this device?",
);

const removalBody = computed(() => {
  if (!pending.value) return "";
  return pending.value.mode === "delete"
    ? `“${pending.value.title}” will be erased. Everyone you gave the link to loses it too, not just you, and there is no undo.`
    : `“${pending.value.title}” disappears from this list on this device. Your link keeps working, but you will not be able to change the itinerary again.`;
});

const removalConfirmLabel = computed(() => {
  if (!pending.value) return "";
  if (removing.value) return "Deleting…";
  return pending.value.mode === "delete" ? "Delete for everyone" : "Forget it";
});

async function confirmRemoval() {
  const target = pending.value;
  if (!target || removing.value) return;

  if (target.mode === "forget") {
    library.forget(target.id);
    pending.value = null;
    return;
  }

  removing.value = true;
  removalError.value = "";
  try {
    await deleteBlob(target.id, library.keyFor(target.id));
    library.forget(target.id);
    pending.value = null;
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    removalError.value = `Could not delete it — ${why}.`;
  } finally {
    removing.value = false;
  }
}
</script>

<template>
  <header class="app-header">
    <a class="no-print back" href="/" title="All tools">
      <svg
        viewBox="0 0 24 24"
        width="13"
        height="13"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M15 5l-7 7 7 7" />
      </svg>
      All tools
    </a>

    <div class="hdr-row">
      <h1 class="hdr-title">Itineraries</h1>
      <div class="hdr-actions">
        <button
          class="btn is-icon"
          title="Toggle theme"
          aria-label="Toggle theme"
          @click="settings.toggleTheme"
        >
          {{ settings.theme === "dark" ? "☀" : "☾" }}
        </button>
      </div>
    </div>
  </header>

  <div v-if="!library.items.length" class="empty">
    <p class="pitch">
      Plan a trip as a list of flights, drives, places to stay and things you have booked, each
      in its own time zone. Share it with a link, print it for the journey, or hand it to an AI
      assistant to fill in from your confirmation emails.
    </p>
    <div class="empty-actions">
      <button class="btn is-primary is-lg" @click="createItinerary">
        {{ creating ? "Creating…" : "Create itinerary" }}
      </button>
      <RouterLink class="btn is-lg demo" :to="tripPath(DEMO_ID, false)">
        View a demo trip
      </RouterLink>
    </div>
  </div>

  <template v-else>
    <ul class="rows">
      <LibraryRow
        v-for="item in library.items"
        :key="item.id"
        :item="item"
        @forget="ask(item, 'forget')"
        @delete="ask(item, 'delete')"
      />
    </ul>
    <div class="below">
      <button class="btn is-primary" @click="createItinerary">
        {{ creating ? "Creating…" : "Create itinerary" }}
      </button>
      <RouterLink class="demo-link" :to="tripPath(DEMO_ID, false)">
        View a demo trip
      </RouterLink>
    </div>
  </template>

  <div v-if="createError" class="error-box spaced">{{ createError }}</div>

  <ConfirmDialog
    v-if="pending"
    :title="removalTitle"
    :body="removalBody"
    :confirm-label="removalConfirmLabel"
    :error="removalError"
    @confirm="confirmRemoval"
    @cancel="pending = null"
  />
</template>

<style scoped>
.app-header {
  margin-bottom: 32px;
}

.back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--muted);
  text-decoration: none;
}

.back:hover {
  color: var(--accent);
}

.hdr-row {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 40px;
  flex-wrap: wrap;
}

.hdr-title {
  margin: 0;
  min-width: 0;
  font-size: 34px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.15;
}

.hdr-actions {
  margin-left: auto;
  flex: 0 0 auto;
  display: flex;
  gap: 8px;
  align-items: center;
}

.empty {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--card);
  padding: 28px 24px;
  text-align: center;
}

.pitch {
  margin: 0 auto;
  max-width: 44ch;
  font-size: 14px;
  color: var(--muted);
  line-height: 1.65;
}

.empty-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  margin-top: 22px;
}

.demo {
  background: transparent;
  color: var(--fg);
  text-decoration: none;
}

.demo:hover {
  color: var(--accent);
}

.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.below {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 18px;
}

.demo-link {
  font-size: 13px;
}

.spaced {
  margin-top: 14px;
}

@media screen and (max-width: 860px) {
  .hdr-row {
    align-items: flex-start;
    gap: 10px;
  }

  .hdr-title {
    flex: 1 1 100%;
    width: 100%;
    font-size: 28px;
  }

  .hdr-actions {
    margin-left: 0;
    width: 100%;
  }
}
</style>

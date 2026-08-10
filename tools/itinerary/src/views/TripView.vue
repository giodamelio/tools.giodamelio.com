<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { EVERYONE, type Entry, type EntryType } from "../types";
import { SAVE_NOTES } from "../lib/schema";
import { newEntryId } from "../lib/id";
import { localZone, todayIso } from "../lib/time";
import { calendarMonths, entryView, groupDays, spanLabel } from "../lib/present";
import { shareLink } from "../lib/share";
import { useTripStore } from "../stores/trip";
import { useSettingsStore } from "../stores/settings";
import { usePrintPageSize } from "../composables/usePrintPageSize";
import TripToolbar from "../components/TripToolbar.vue";
import ListView from "../components/ListView.vue";
import CalendarView from "../components/CalendarView.vue";
import EntryDialog from "../components/EntryDialog.vue";
import SettingsDialog from "../components/SettingsDialog.vue";
import HandoffDialog from "../components/HandoffDialog.vue";
import SmartAddDialog from "../components/SmartAddDialog.vue";

const route = useRoute();
const trip = useTripStore();
const settings = useSettingsStore();

usePrintPageSize(computed(() => settings.view));

watch(
  () => route.params.id,
  (id) => void trip.load(String(id)),
  { immediate: true },
);

const hiddenPeople = ref<string[]>([]);
const hiddenTypes = ref<EntryType[]>([]);

const draft = ref<Entry | null>(null);
const settingsOpen = ref(false);
const handoffOpen = ref(false);
const smartOpen = ref(false);
const smartHintOpen = ref(false);
const copied = ref(false);

/* An entry with nobody on it always shows; "Everyone" shows while anyone does. */
const visible = computed(() => {
  const anyone =
    trip.rosterNames.length === 0 ||
    trip.rosterNames.some((n) => !hiddenPeople.value.includes(n));

  return trip.entries.filter((entry) => {
    if (hiddenTypes.value.includes(entry.type)) return false;
    if (!entry.people.length) return true;
    if (entry.people.includes(EVERYONE)) return anyone;
    return entry.people.some((n) => !hiddenPeople.value.includes(n));
  });
});

const views = computed(() =>
  visible.value
    .map((entry) => entryView(entry, trip.tzMode, trip.palette))
    .sort((a, b) => a.instant - b.instant),
);

const days = computed(() => groupDays(views.value, trip.tzMode));
const months = computed(() => calendarMonths(views.value));
const subtitle = computed(() => (trip.loadError ? "" : spanLabel(views.value)));
const saveNote = computed(() => SAVE_NOTES[trip.saveState] ?? "");

function defaultZone(): string {
  const last = trip.entries[trip.entries.length - 1];
  return last?.endTz || last?.startTz || localZone();
}

function openDraft(dayIso: string | null) {
  const day = dayIso || trip.entries[0]?.start?.slice(0, 10) || todayIso();
  const zone = defaultZone();
  draft.value = {
    id: newEntryId(),
    type: "flight",
    start: `${day}T12:00`,
    startTz: zone,
    endTz: zone,
    people: [EVERYONE],
  };
}

function commitDraft() {
  if (draft.value) trip.addEntry(draft.value);
  draft.value = null;
}

/* Flush first: the link has to point at what the other person will open. */
async function copyLink() {
  await trip.saveNow();
  const how = await shareLink(location.href, trip.title);
  if (how !== "copied") return;
  copied.value = true;
  setTimeout(() => (copied.value = false), 1800);
}

function openSettingsFromHint() {
  smartHintOpen.value = false;
  settingsOpen.value = true;
}

function doPrint() {
  window.print();
}
</script>

<template>
  <template v-if="!trip.loading">
    <header class="app-header">
      <RouterLink class="no-print back" :to="{ name: 'library' }" title="All itineraries">
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
        All itineraries
      </RouterLink>

      <div class="hdr-row">
        <input
          v-if="trip.editing"
          v-model="trip.title"
          class="hdr-title hdr-input"
          placeholder="Name this trip"
          title="Trip name"
        />
        <h1 v-else class="hdr-title">{{ trip.title }}</h1>

        <div class="no-print hdr-actions">
          <button class="btn" @click="copyLink">{{ copied ? "Link copied" : "Share" }}</button>
          <button class="btn" @click="doPrint">Print</button>
          <!-- Fixed width: "Done" is bold and wider than "Edit", and this row is
               right-aligned, so a size change would slide Share and Print. -->
          <button
            v-if="trip.canEdit"
            class="btn edit-toggle"
            :class="{ 'is-primary': trip.editing }"
            @click="trip.setEditing(!trip.editing)"
          >
            {{ trip.editing ? "Done" : "Edit" }}
          </button>
          <button
            class="btn is-icon"
            title="Toggle theme"
            aria-label="Toggle theme"
            @click="settings.toggleTheme"
          >
            {{ settings.theme === "dark" ? "☀" : "☾" }}
          </button>
          <!-- Everything behind it configures Smart Add, which only exists while
               editing. The theme sits outside for exactly this reason. -->
          <button
            v-if="trip.canEdit"
            class="btn is-muted is-icon"
            title="Settings"
            aria-label="Settings"
            @click="settingsOpen = true"
          >
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="3.1" />
              <path
                d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a1.9 1.9 0 1 1-3.8 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3.4a1.9 1.9 0 1 1 0-3.8h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5V3.4a1.9 1.9 0 1 1 3.8 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.2a1.9 1.9 0 1 1 0 3.8h-.1a1.6 1.6 0 0 0-1.5 1z"
              />
            </svg>
          </button>
        </div>
      </div>

      <div v-if="trip.editing" class="no-print edit-actions">
        <button
          v-if="settings.apiKey"
          class="btn is-tinted is-sm"
          title="Paste a confirmation email or notes and an AI agent proposes changes here, for you to review before anything is applied"
          @click="smartOpen = true"
        >
          <svg
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M4 20 15 9" />
            <path d="M14 5.5 15.4 8l2.6 1.4-2.6 1.4L14 13.4l-1.4-2.6L10 9.4 12.6 8z" />
            <path d="M6 4.2l.6 1.2 1.2.6-1.2.6L6 7.8l-.6-1.2L4.2 6l1.2-.6z" />
          </svg>
          Smart Add
        </button>

        <span
          v-else
          class="hint-wrap"
          @mouseenter="smartHintOpen = true"
          @mouseleave="smartHintOpen = false"
        >
          <button
            class="btn is-sm dashed"
            aria-disabled="true"
            @click="smartHintOpen = !smartHintOpen"
          >
            <svg
              viewBox="0 0 24 24"
              width="13"
              height="13"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M4 20 15 9" />
              <path d="M14 5.5 15.4 8l2.6 1.4-2.6 1.4L14 13.4l-1.4-2.6L10 9.4 12.6 8z" />
              <path d="M6 4.2l.6 1.2 1.2.6-1.2.6L6 7.8l-.6-1.2L4.2 6l1.2-.6z" />
            </svg>
            Smart Add
          </button>
          <span v-if="smartHintOpen" class="hint-anchor">
            <span class="popover hint">
              <span class="hint-copy">
                Smart Add lets an AI agent turn a pasted confirmation email into proposed
                changes you review. It needs an API key, which is stored in this browser only.
              </span>
              <button class="btn is-primary is-sm hint-btn" @click="openSettingsFromHint">
                Add a key in Settings
              </button>
            </span>
          </span>
        </span>

        <button
          class="btn is-tinted is-sm"
          title="Lets an AI assistant in another app read and change this itinerary for the next hour"
          @click="handoffOpen = true"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
            <path d="M12 2.5l1.9 5.4 5.4 1.9-5.4 1.9L12 17.1l-1.9-5.4-5.4-1.9 5.4-1.9z" />
            <path d="M18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
          </svg>
          Hand off to an assistant
        </button>

        <button class="btn is-primary is-sm" title="Add an item" @click="openDraft(null)">
          <svg
            viewBox="0 0 24 24"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            stroke-width="2.6"
            stroke-linecap="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add
        </button>
      </div>

      <p class="subtitle">
        {{ subtitle }}
        <span v-if="saveNote" class="no-print"> · {{ saveNote }}</span>
      </p>

      <div v-if="trip.saveState === 'error'" class="no-print error-box is-row spaced">
        <span class="why">
          Could not save — {{ trip.saveError }}. Your changes are still here in this tab.
        </span>
        <button class="btn is-danger retry" @click="trip.saveNow()">Try again</button>
      </div>

      <div v-if="trip.loadError" class="error-box spaced">{{ trip.loadError }}</div>

      <TripToolbar
        v-if="!trip.loadError"
        v-model:hidden-people="hiddenPeople"
        v-model:hidden-types="hiddenTypes"
      />
    </header>

    <template v-if="!trip.loadError">
      <ListView v-if="settings.view !== 'calendar'" :days="days" @add="openDraft" />
      <CalendarView v-else :months="months" />
    </template>

    <EntryDialog v-if="draft" v-model="draft" @close="draft = null" @commit="commitDraft" />
    <SettingsDialog v-if="settingsOpen" @close="settingsOpen = false" />
    <HandoffDialog v-if="handoffOpen" @close="handoffOpen = false" />
    <SmartAddDialog v-if="smartOpen" @close="smartOpen = false" />
  </template>
</template>

<style scoped>
.app-header {
  margin-bottom: 44px;
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
  border-bottom: 1px solid transparent;
}

.hdr-input {
  flex: 1 1 auto;
  box-sizing: content-box;
  background: transparent;
  border: 0;
  border-bottom: 1px dashed var(--accent);
  line-height: 39.1px;
  height: 39.1px;
  padding: 0;
  outline: none;
}

.hdr-actions {
  margin-left: auto;
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.edit-toggle {
  min-width: 70px;
}

.edit-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
  margin-top: 10px;
}

.dashed {
  background: transparent;
  border-style: dashed;
  border-color: var(--border);
  color: var(--muted);
  cursor: help;
}

.dashed:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.hint-wrap {
  position: relative;
  display: flex;
}

.hint-anchor {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 30;
  padding-top: 8px;
  display: block;
}

.hint {
  width: 260px;
  background: var(--card);
  padding: 12px 14px;
  text-align: left;
}

.hint-copy {
  display: block;
}

.hint-btn {
  margin-top: 10px;
}

.subtitle {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 14px;
}

.spaced {
  margin-top: 10px;
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

@media screen and (max-width: 860px) {
  .app-header {
    margin-bottom: 22px;
  }

  .hdr-row {
    align-items: flex-start;
    gap: 10px;
    min-height: 0;
  }

  .hdr-title {
    flex: 1 1 100%;
    width: 100%;
    font-size: 28px;
  }

  .hdr-actions {
    margin-left: 0;
    width: 100%;
    gap: 6px;
  }

  .subtitle {
    margin-top: 6px;
  }
}

@media screen and (max-width: 520px) {
  .hdr-actions .btn {
    flex: 1 1 auto;
    justify-content: center;
  }
}
</style>

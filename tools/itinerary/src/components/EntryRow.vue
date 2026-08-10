<script setup lang="ts">
import { computed, onUnmounted } from "vue";
import type { Entry } from "../types";
import type { EntryView } from "../lib/present";
import { chipStyle } from "../lib/present";
import { useTripStore } from "../stores/trip";
import TypeIcon from "./TypeIcon.vue";
import EntryFields from "./EntryFields.vue";
import PeoplePicker from "./PeoplePicker.vue";

const props = defineProps<{ view: EntryView }>();

const trip = useTripStore();

const entry = computed(() => props.view.entry);
const open = computed(() => trip.openId === entry.value.id);
const detailOpen = computed(() => trip.detailId === entry.value.id);

let leaveTimer: ReturnType<typeof setTimeout> | undefined;
onUnmounted(() => clearTimeout(leaveTimer));

function showDetail() {
  clearTimeout(leaveTimer);
  trip.detailId = entry.value.id;
}

/* A short grace period: the popover sits below the button with a gap, and the
   pointer has to cross it. */
function hideDetail() {
  clearTimeout(leaveTimer);
  leaveTimer = setTimeout(() => {
    if (trip.detailId === entry.value.id) trip.detailId = null;
  }, 220);
}

function toggleDetail() {
  trip.detailId = detailOpen.value ? null : entry.value.id;
}

function toggleOpen() {
  trip.openId = open.value ? null : entry.value.id;
}

function patch(key: keyof Entry, value: string) {
  trip.patchEntry(entry.value.id, { [key]: value });
}

const people = computed({
  get: () => entry.value.people,
  set: (next: string[]) => trip.patchEntry(entry.value.id, { people: next }),
});

const chips = computed(() =>
  entry.value.people.map((name) => ({ name, style: chipStyle(name, true, trip.palette) })),
);
</script>

<template>
  <div class="entry">
    <div class="e-time">
      <div class="clock">{{ view.time }}</div>
      <div class="e-zone">{{ view.zone }}</div>
    </div>

    <div class="e-icon" :title="view.kind" :aria-label="view.kind">
      <TypeIcon :type="entry.type" />
    </div>

    <div class="e-body">
      <div class="headline">
        <span class="title">{{ view.title }}</span>

        <span
          v-if="view.hasDetail"
          class="detail-wrap"
          @mouseenter="showDetail"
          @mouseleave="hideDetail"
        >
          <button class="carrier-btn" @click="toggleDetail">{{ view.carrier }}</button>
          <span v-if="detailOpen" class="no-print detail-anchor">
            <span class="detail-card">
              <span class="detail-title">{{ view.carrier }}</span>
              <span class="detail-grid">
                <template v-for="row in view.detailRows" :key="row.label">
                  <span class="detail-label">{{ row.label }}</span>
                  <span class="detail-place">{{ row.place }}</span>
                  <span class="detail-time">{{ row.time }}</span>
                </template>
              </span>
              <a
                v-if="view.trackUrl"
                class="track"
                :href="view.trackUrl"
                target="_blank"
                rel="noreferrer"
              >
                Track on FlightAware →
              </a>
            </span>
          </span>
        </span>

        <span v-else class="carrier">{{ view.carrier }}</span>
      </div>

      <div v-for="line in view.meta" :key="line" class="meta">{{ line }}</div>
    </div>

    <div class="e-people">
      <span v-for="chip in chips" :key="chip.name" class="chip is-static" :style="chip.style">
        {{ chip.name }}
      </span>
    </div>

    <div class="no-print row-actions">
      <template v-if="trip.editing">
        <button
          class="btn is-tinted is-tiny"
          :title="open ? 'Done' : 'Edit'"
          :aria-label="open ? 'Done' : 'Edit'"
          @click="toggleOpen"
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
        <button
          class="btn is-danger is-tiny tinted-danger"
          title="Delete"
          aria-label="Delete"
          @click="trip.removeEntry(entry.id)"
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
            <path d="M4 6.5h16" />
            <path d="M9.5 6.5V4.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.7" />
            <path d="M6.5 6.5 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.5" />
            <path d="M10.5 10v6.5M13.5 10v6.5" />
          </svg>
        </button>
      </template>
    </div>

    <div v-if="open" class="no-print editor">
      <EntryFields
        :type="entry.type"
        :source="entry"
        :scope="`entry:${entry.id}`"
        @patch="patch"
      />
      <div class="who">
        <div class="field-label who-head">Who is on this</div>
        <PeoplePicker v-model="people" :scope="`entry:${entry.id}`" with-add />
      </div>
    </div>
  </div>
</template>

<style scoped>
.entry {
  display: grid;
  grid-template-columns: 76px 22px minmax(0, 1fr) 164px 76px;
  gap: 16px;
  padding: 14px 0;
  align-items: start;
}

.entry + .entry {
  border-top: 1px solid var(--rule);
}

.e-time {
  text-align: right;
}

.clock {
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.35;
}

.e-zone {
  font-size: 10px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.e-icon {
  width: 22px;
  height: 22px;
  color: var(--muted);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 2px;
  cursor: default;
}

.e-icon:hover {
  color: var(--accent);
}

.e-body {
  min-width: 0;
}

.headline {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.title {
  font-size: 15px;
  font-weight: 550;
}

.carrier {
  font-size: 12px;
  color: var(--muted);
}

.detail-wrap {
  position: relative;
  display: inline-flex;
}

.carrier-btn {
  background: transparent;
  border: 0;
  border-bottom: 1px dashed var(--muted);
  padding: 0 0 1px;
  font-size: 12px;
  color: var(--muted);
  cursor: pointer;
}

.carrier-btn:hover {
  color: var(--accent);
  border-color: var(--accent);
}

.detail-anchor {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 30;
  padding-top: 8px;
  display: block;
}

.detail-card {
  display: block;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 14px;
  min-width: 250px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
}

.detail-title {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}

.detail-grid {
  display: grid;
  grid-template-columns: auto 1fr auto;
  column-gap: 14px;
  font-size: 12px;
  line-height: 1.7;
}

.detail-label {
  color: var(--muted);
}

.detail-place {
  min-width: 0;
}

.detail-time {
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.track {
  display: inline-block;
  margin-top: 9px;
  font-size: 12px;
}

.meta {
  font-size: 13px;
  color: var(--muted);
  margin-top: 2px;
}

.e-people {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-content: flex-start;
  padding-top: 2px;
}

.row-actions {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
  padding-top: 1px;
}

.tinted-danger {
  background: color-mix(in oklab, var(--danger) 12%, transparent);
}

.editor {
  --input-bg: var(--bg);
  grid-column: 1 / -1;
  margin-top: 12px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
  display: grid;
  gap: 12px 14px;
}

.who {
  border-top: 1px solid var(--border);
  padding-top: 12px;
  margin-top: 2px;
}

.who-head {
  margin-bottom: 7px;
}

@media print {
  .entry {
    grid-template-columns: 76px 22px minmax(0, 1fr) 164px;
    break-inside: avoid;
    page-break-inside: avoid;
  }
}

/* Below the fold the four columns become two rows of one: time and icon share
   a line, everything else stacks under them. */
@media screen and (max-width: 860px) {
  .entry {
    grid-template-columns: 22px minmax(0, 1fr);
    column-gap: 12px;
    row-gap: 4px;
    padding: 12px 0;
  }

  .e-icon {
    grid-column: 1;
    grid-row: 1;
  }

  .e-time {
    grid-column: 2;
    grid-row: 1;
    text-align: left;
    display: flex;
    align-items: baseline;
    gap: 7px;
  }

  .e-zone {
    line-height: 1.35;
  }

  .e-body {
    grid-column: 2;
    grid-row: 2;
  }

  .e-people {
    grid-column: 2;
    grid-row: 3;
    padding-top: 4px;
  }

  .row-actions {
    grid-column: 2;
    grid-row: 4;
    justify-content: flex-start;
    padding-top: 4px;
  }

  .row-actions:empty {
    display: none;
  }

  .row-actions .btn {
    width: 34px;
    height: 34px;
  }

  .row-actions .btn svg {
    width: 15px;
    height: 15px;
  }
}
</style>

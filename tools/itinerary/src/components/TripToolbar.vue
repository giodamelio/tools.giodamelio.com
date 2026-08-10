<script setup lang="ts">
import { computed, ref, useTemplateRef } from "vue";
import { ENTRY_TYPES, type EntryType } from "../types";
import { TYPE_PLURALS } from "../lib/schema";
import { chipStyle } from "../lib/present";
import { zoneLabelFor } from "../lib/zones";
import { useTripStore } from "../stores/trip";
import { useSettingsStore } from "../stores/settings";
import { useZoneChooser } from "../composables/useZoneChooser";
import TypeIcon from "./TypeIcon.vue";

const hiddenPeople = defineModel<string[]>("hiddenPeople", { required: true });
const hiddenTypes = defineModel<EntryType[]>("hiddenTypes", { required: true });

const trip = useTripStore();
const settings = useSettingsStore();
const chooser = useZoneChooser();

const typeMenuOpen = ref(false);
const tzButton = useTemplateRef<HTMLButtonElement>("tzButton");

const shownTypes = computed(() => ENTRY_TYPES.filter((t) => !hiddenTypes.value.includes(t)));

/* No noun: "Everything" and "Nothing" say it without needing a word for what
   an entry is, and the counts keep the width steady. */
const typeFilterLabel = computed(() => {
  if (shownTypes.value.length === ENTRY_TYPES.length) return "Everything";
  if (!shownTypes.value.length) return "Nothing";
  return `${shownTypes.value.length} of ${ENTRY_TYPES.length}`;
});

function countOf(type: EntryType): number {
  return trip.entries.filter((e) => e.type === type).length;
}

function toggleType(type: EntryType) {
  hiddenTypes.value = hiddenTypes.value.includes(type)
    ? hiddenTypes.value.filter((t) => t !== type)
    : [...hiddenTypes.value, type];
}

function togglePerson(name: string) {
  hiddenPeople.value = hiddenPeople.value.includes(name)
    ? hiddenPeople.value.filter((n) => n !== name)
    : [...hiddenPeople.value, name];
}

function personStyle(name: string) {
  return chipStyle(name, !hiddenPeople.value.includes(name), trip.palette);
}

const tzModeLabel = computed(() =>
  trip.tzMode === "local" ? "Local time at each stop" : zoneLabelFor(trip.tzMode),
);

function openZones() {
  if (tzButton.value) {
    chooser.openAt(tzButton.value, { allowLocal: true }, (id) => (trip.tzMode = id));
  }
}
</script>

<template>
  <div class="no-print toolbar-row">
    <span class="views">
      <button
        class="view-btn is-first"
        :class="{ 'is-on': settings.view !== 'calendar' }"
        title="View as list"
        aria-label="View as list"
        @click="settings.view = 'list'"
      >
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      <button
        class="view-btn is-last"
        :class="{ 'is-on': settings.view === 'calendar' }"
        title="View as calendar"
        aria-label="View as calendar"
        @click="settings.view = 'calendar'"
      >
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
          <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
        </svg>
      </button>
    </span>

    <span v-if="trip.rosterNames.length > 1" class="filter-chips">
      <span class="lede">Show</span>
      <button
        v-for="name in trip.rosterNames"
        :key="name"
        class="chip is-filter"
        :style="personStyle(name)"
        @click="togglePerson(name)"
      >
        {{ name }}
      </button>
    </span>

    <span class="type-wrap">
      <button class="picker types" title="What to show" @click="typeMenuOpen = !typeMenuOpen">
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="lead"
        >
          <path d="M3.5 5.5h17l-6.6 7.6v5.6l-3.8 2.3v-7.9z" />
        </svg>
        <span class="picker-text">{{ typeFilterLabel }}</span>
        <svg
          viewBox="0 0 24 24"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="lead"
        >
          <path d="M6 9.5l6 6 6-6" />
        </svg>
      </button>

      <template v-if="typeMenuOpen">
        <span class="menu-scrim" @click="typeMenuOpen = false" />
        <span class="menu type-menu">
          <button
            v-for="type in ENTRY_TYPES"
            :key="type"
            class="menu-item type-item"
            :class="{ 'is-off': hiddenTypes.includes(type) }"
            @click="toggleType(type)"
          >
            <svg
              v-if="!hiddenTypes.includes(type)"
              viewBox="0 0 24 24"
              width="15"
              height="15"
              class="box"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="18" height="18" rx="5" fill="var(--accent)" />
              <path
                d="M7.6 12.4l3 3 5.8-6.4"
                fill="none"
                stroke="var(--bg)"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <svg
              v-else
              viewBox="0 0 24 24"
              width="15"
              height="15"
              class="box"
              aria-hidden="true"
            >
              <rect
                x="3"
                y="3"
                width="18"
                height="18"
                rx="5"
                fill="none"
                stroke="var(--border)"
                stroke-width="2"
              />
            </svg>
            <span class="type-icon"><TypeIcon :type="type" :size="15" /></span>
            <span class="type-name">{{ TYPE_PLURALS[type] }}</span>
            <span class="type-count">{{ countOf(type) }}</span>
          </button>

          <span class="menu-rule" />
          <span class="bulk">
            <button class="btn is-outline grow" @click="hiddenTypes = []">All</button>
            <button class="btn is-outline grow" @click="hiddenTypes = [...ENTRY_TYPES]">
              None
            </button>
          </span>
        </span>
      </template>
    </span>

    <span class="tz-wrap">
      <button
        ref="tzButton"
        class="picker tz"
        title="Which time zone to show times in"
        @click="openZones"
      >
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="lead"
        >
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 1.8" />
        </svg>
        <span class="picker-text">{{ tzModeLabel }}</span>
        <svg
          viewBox="0 0 24 24"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="lead"
        >
          <path d="M6 9.5l6 6 6-6" />
        </svg>
      </button>
    </span>
  </div>
</template>

<style scoped>
.toolbar-row {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: center;
  margin-top: 16px;
}

.views {
  display: flex;
}

.view-btn {
  width: 52px;
  height: 44px;
  padding: 0;
  background: var(--card);
  border: 1px solid var(--border);
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.view-btn:hover {
  border-color: var(--accent);
}

.view-btn.is-first {
  border-radius: 9px 0 0 9px;
  margin-right: -1px;
}

.view-btn.is-last {
  border-radius: 0 9px 9px 0;
}

/* The chosen half owns the shared edge, so the seam reads as one control. */
.view-btn.is-on {
  background: color-mix(in oklab, var(--accent) 14%, transparent);
  border-color: var(--accent);
  color: var(--accent);
  z-index: 1;
}

.filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.lede {
  font-size: 11px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-right: 2px;
}

.picker {
  display: flex;
  align-items: center;
  gap: 7px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0 10px 0 11px;
  height: 34px;
  font-size: 13px;
  color: var(--fg);
  cursor: pointer;
  white-space: nowrap;
}

.picker:hover {
  border-color: var(--accent);
}

.picker-text {
  flex: 1 1 auto;
  min-width: 0;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lead {
  color: var(--muted);
  flex: 0 0 auto;
}

.types {
  width: 132px;
}

.tz {
  width: 206px;
}

.type-wrap {
  margin-left: auto;
  display: flex;
  position: relative;
  align-items: center;
}

.tz-wrap {
  display: flex;
  position: relative;
  align-items: center;
}

.type-menu {
  top: calc(100% + 6px);
  left: 0;
  min-width: 216px;
}

.type-item {
  padding: 7px 9px;
}

.type-item.is-off {
  color: var(--muted);
}

.box,
.type-icon {
  flex: 0 0 auto;
}

.type-icon {
  display: flex;
  width: 16px;
  color: var(--muted);
}

.type-name {
  flex: 1 1 auto;
  min-width: 0;
}

.type-count {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.bulk {
  display: flex;
  gap: 6px;
  padding: 0 3px 2px;
}

.grow {
  flex: 1 1 auto;
  border-radius: 7px;
  padding: 5px 0;
  font-size: 12px;
  color: var(--fg);
}

@media screen and (max-width: 860px) {
  .toolbar-row {
    gap: 10px;
    margin-top: 12px;
  }

  .type-wrap,
  .tz-wrap {
    margin-left: 0;
  }

  .picker {
    min-height: 38px;
  }

  .filter-chips .chip {
    min-height: 30px;
    padding: 4px 13px;
    font-size: 13px;
  }
}
</style>

<script setup lang="ts">
import { computed, useTemplateRef } from "vue";
import { useTripStore } from "../stores/trip";
import { useZoneChooser } from "../composables/useZoneChooser";
import { abbr, localZone, lowerMeridiem, todayIso, wallToInstant } from "../lib/time";
import { shortZoneName, zoneLabelFor } from "../lib/zones";
import { WEEKDAY_LABELS } from "../lib/present";

const value = defineModel<string>("value", { required: true });
const zone = defineModel<string>("zone", { required: true });

/* Which field this is, trip-wide. Picking a date can move the entry to another
   day, which regroups the list and remounts this component — so whether the
   popover is open, and what month it shows, cannot live here. */
const props = defineProps<{ pickerId: string }>();

const trip = useTripStore();
const chooser = useZoneChooser();

const zoneButton = useTemplateRef<HTMLButtonElement>("zoneButton");

const open = computed(() => trip.openPicker === props.pickerId);
const month = computed(() => (open.value ? trip.pickerMonth : ""));

const datePart = computed(() => value.value.slice(0, 10));
const timePart = computed(() => value.value.slice(11, 16));

function show() {
  trip.pickerMonth = datePart.value.slice(0, 7) || todayIso().slice(0, 7);
  trip.openPicker = props.pickerId;
}

function hide() {
  trip.openPicker = null;
}

function shiftMonth(by: number) {
  const [y, m] = (month.value || todayIso().slice(0, 7)).split("-").map(Number);
  trip.pickerMonth = new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
}

const monthLabel = computed(() => {
  if (!month.value) return "";
  const [y, m] = month.value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
});

interface DayCell {
  iso: string;
  label: string;
  inMonth: boolean;
  selected: boolean;
}

/* Six weeks always fit a month; the sixth is only shown when it carries one. */
const days = computed<DayCell[]>(() => {
  if (!open.value || !month.value) return [];
  const [y, m] = month.value.split("-").map(Number);
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();

  const cells: DayCell[] = [];
  for (let i = 0; i < 42; i++) {
    const at = new Date(Date.UTC(y, m - 1, 1 - firstDow + i));
    const iso = at.toISOString().slice(0, 10);
    cells.push({
      iso,
      label: String(at.getUTCDate()),
      inMonth: at.getUTCMonth() === m - 1,
      selected: iso === datePart.value,
    });
  }
  const tail = cells.slice(35);
  return tail.every((cell) => !cell.inMonth && !cell.selected) ? cells.slice(0, 35) : cells;
});

function pickDay(iso: string) {
  value.value = `${iso}T${timePart.value || "12:00"}`;
}

function pickTime(event: Event) {
  const time = (event.target as HTMLInputElement).value || "12:00";
  value.value = `${datePart.value || todayIso()}T${time}`;
}

/* The zones this trip already uses, the ones it uses on this very day first.
   Four buttons cover almost every real correction without opening the search. */
const nearby = computed(() => {
  const mine = localZone();
  const counts: Record<string, number> = {};
  const onThisDay: Record<string, number> = {};

  for (const entry of trip.entries) {
    const day = datePart.value;
    const touches =
      (!!entry.start && entry.start.slice(0, 10) === day) ||
      (!!entry.end &&
        !!day &&
        !!entry.start &&
        entry.start.slice(0, 10) <= day &&
        entry.end.slice(0, 10) >= day);

    for (const id of [entry.startTz, entry.endTz]) {
      if (!id) continue;
      counts[id] = (counts[id] ?? 0) + 1;
      if (touches) onThisDay[id] = (onThisDay[id] ?? 0) + 1;
    }
  }

  const rank = (id: string) =>
    (onThisDay[id] ? 1000 + onThisDay[id] : 0) + (counts[id] ?? 0) + (id === mine ? 0.5 : 0);

  const ids = Object.keys(counts)
    .concat(counts[mine] ? [] : [mine])
    .sort((a, b) => rank(b) - rank(a));
  if (zone.value && !ids.includes(zone.value)) ids.unshift(zone.value);
  return ids;
});

const display = computed(() => {
  if (!value.value) return "Pick a date and time";
  const day = new Date(`${datePart.value}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const clock = lowerMeridiem(
    new Date(`1970-01-01T${timePart.value || "12:00"}:00Z`).toLocaleTimeString("en-US", {
      timeZone: "UTC",
      hour: "numeric",
      minute: "2-digit",
    }),
  );
  const instant = wallToInstant(value.value, zone.value);
  return `${day} · ${clock}${instant ? " " + abbr(instant, zone.value) : ""}`;
});

function openZones() {
  if (zoneButton.value) {
    chooser.openAt(zoneButton.value, { allowLocal: false }, (id) => (zone.value = id));
  }
}
</script>

<template>
  <div class="when">
    <button class="summary" @click="show">{{ display }}</button>

    <template v-if="open">
      <div class="menu-scrim" @click="hide" />
      <div class="picker-pop">
        <div class="month">
          <button
            class="btn is-outline nav"
            aria-label="Previous month"
            @click="shiftMonth(-1)"
          >
            ‹
          </button>
          <div class="month-label">{{ monthLabel }}</div>
          <button class="btn is-outline nav" aria-label="Next month" @click="shiftMonth(1)">
            ›
          </button>
        </div>

        <div class="grid weekdays">
          <div v-for="(label, i) in WEEKDAY_LABELS" :key="i">{{ label }}</div>
        </div>

        <div class="grid">
          <button
            v-for="day in days"
            :key="day.iso"
            class="day"
            :class="{ 'is-selected': day.selected, 'is-outside': !day.inMonth }"
            @click="pickDay(day.iso)"
          >
            {{ day.label }}
          </button>
        </div>

        <div class="line">
          <span class="field-label line-label">Time</span>
          <input type="time" class="text-input" :value="timePart" @change="pickTime" />
        </div>

        <div class="line">
          <span class="field-label line-label">Zone</span>
          <button ref="zoneButton" class="zone" @click="openZones">
            {{ zoneLabelFor(zone) }}
          </button>
        </div>

        <div v-if="nearby.length > 1" class="nearby">
          <button
            v-for="id in nearby.slice(0, 4)"
            :key="id"
            class="chip is-filter"
            :class="{ 'is-current': id === zone }"
            @click="zone = id"
          >
            {{ shortZoneName(id) }}
          </button>
        </div>

        <button class="btn is-primary done" @click="hide">Done</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.when {
  position: relative;
  margin-top: 3px;
}

.summary,
.zone {
  width: 100%;
  text-align: left;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 7px 9px;
  font-size: 13px;
  color: var(--fg);
  cursor: pointer;
  text-transform: none;
  letter-spacing: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.summary:hover,
.zone:hover {
  border-color: var(--accent);
}

.picker-pop {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 41;
  width: 284px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.45);
  text-transform: none;
  letter-spacing: 0;
}

.month {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.nav {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  padding: 0;
  font-size: 13px;
  line-height: 1;
}

.month-label {
  flex: 1 1 auto;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
}

.grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}

.weekdays {
  margin-bottom: 4px;
  text-align: center;
  font-size: 10px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.day {
  background: transparent;
  color: var(--fg);
  border: 1px solid transparent;
  border-radius: 6px;
  height: 30px;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}

.day:hover {
  border-color: var(--accent);
}

.day.is-outside {
  color: var(--muted);
}

.day.is-selected {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--bg);
}

.line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.line:first-of-type {
  margin-top: 12px;
}

.line-label {
  flex: 0 0 42px;
}

.line .text-input,
.line .zone {
  flex: 1 1 auto;
  min-width: 0;
  padding: 6px 8px;
}

.nearby {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
  padding-left: 50px;
}

.nearby .chip {
  font-size: 11px;
  padding: 2px 9px;
  color: var(--muted);
}

.nearby .chip.is-current {
  color: var(--accent);
  border-color: var(--accent);
  background: color-mix(in oklab, var(--accent) 12%, transparent);
}

.done {
  width: 100%;
  margin-top: 12px;
  padding: 7px 0;
}

@media screen and (max-width: 860px) {
  .picker-pop {
    position: fixed;
    left: 12px;
    right: 12px;
    top: auto;
    bottom: 12px;
    width: auto;
    z-index: 70;
  }
}
</style>

<script setup lang="ts">
import { computed } from "vue";
import { useZoneChooser } from "../composables/useZoneChooser";
import { useTripStore } from "../stores/trip";
import { zoneGroups } from "../lib/zones";

/* Flat rather than nested: the arrow keys walk the list the way it reads, so
   a group heading is a property of the row that opens the group. */
interface Row {
  id: string;
  city: string;
  note: string;
  offsetLabel: string;
  group: string;
}

const LOCAL_LABEL = "Local time at each stop";

const trip = useTripStore();
const { open, allowLocal, position, query, active, close, pick, move } = useZoneChooser();

const rows = computed<Row[]>(() => {
  if (!open.value) return [];
  const q = query.value.trim().toLowerCase();
  const found: Row[] = [];

  if (allowLocal.value && (!q || LOCAL_LABEL.toLowerCase().includes(q))) {
    found.push({ id: "local", city: LOCAL_LABEL, note: "", offsetLabel: "", group: "" });
  }
  for (const group of zoneGroups(trip.tripZones, query.value)) {
    for (const zone of group.zones) {
      found.push({
        id: zone.id,
        city: zone.city,
        note: zone.note,
        offsetLabel: zone.offsetLabel,
        group: zone === group.zones[0] ? group.label : "",
      });
    }
  }
  return found;
});

function isChosen(row: Row): boolean {
  return row.id === trip.tzMode || (row.id === "local" && trip.tzMode === "local");
}

function onKey(event: KeyboardEvent) {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    move(1, rows.value.length);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    move(-1, rows.value.length);
  } else if (event.key === "Enter") {
    event.preventDefault();
    const row = rows.value[active.value];
    if (row) pick(row.id);
  } else if (event.key === "Escape") {
    event.preventDefault();
    close();
  }
}
</script>

<template>
  <template v-if="open">
    <div class="no-print scrim" @click="close" />
    <div class="no-print pop" :style="position">
      <div class="search">
        <input
          id="zone-search"
          v-model="query"
          class="text-input"
          placeholder="Search a city, country or time zone"
          autocomplete="off"
          @input="active = 0"
          @keydown="onKey"
        />
      </div>
      <div class="list">
        <template v-for="(row, i) in rows" :key="row.id">
          <div v-if="row.group" class="group">{{ row.group }}</div>
          <button
            class="row"
            :data-zone-active="i === active ? 'yes' : 'no'"
            :class="{ 'is-chosen': isChosen(row) }"
            @click="pick(row.id)"
          >
            <span class="city">{{ row.city }}</span>
            <span class="note">{{ row.note }}</span>
            <span class="offset">{{ row.offsetLabel }}</span>
          </button>
        </template>
        <div v-if="!rows.length" class="empty">No time zone matches that.</div>
      </div>
    </div>
  </template>
</template>

<style scoped>
.scrim {
  position: fixed;
  inset: 0;
  z-index: 70;
}

.pop {
  position: fixed;
  z-index: 71;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}

.search {
  flex: 0 0 auto;
  padding: 8px;
  border-bottom: 1px solid var(--rule);
}

.search .text-input {
  border-radius: 8px;
  padding: 8px 10px;
}

.list {
  flex: 1 1 auto;
  overflow: auto;
  padding: 6px;
}

.group {
  font-size: 10px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.09em;
  padding: 9px 8px 4px;
}

.row {
  width: 100%;
  display: flex;
  align-items: baseline;
  gap: 8px;
  background: transparent;
  border: 0;
  border-radius: 6px;
  padding: 7px 8px;
  font-size: 13px;
  color: var(--fg);
  text-align: left;
  cursor: pointer;
}

.row:hover,
.row[data-zone-active="yes"] {
  background: var(--card);
}

.row.is-chosen {
  color: var(--accent);
}

.city {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note {
  flex: 0 1 auto;
  min-width: 0;
  font-size: 11px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.offset {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.empty {
  padding: 20px 8px;
  text-align: center;
  font-size: 13px;
  color: var(--muted);
}

@media screen and (max-width: 860px) {
  .pop {
    left: 12px !important;
    right: 12px !important;
    top: auto !important;
    bottom: 12px !important;
    width: auto !important;
    max-height: 66vh !important;
  }
}
</style>

<script setup lang="ts">
import type { DayGroup } from "../lib/present";
import { useTripStore } from "../stores/trip";
import EntryRow from "./EntryRow.vue";

defineProps<{ days: DayGroup[] }>();
const emit = defineEmits<{ add: [dayIso: string | null] }>();

const trip = useTripStore();
</script>

<template>
  <section v-for="day in days" :key="day.key" class="day">
    <div v-if="day.gapLabel" class="gap-rule">
      <div class="rule" />
      <span class="gap-label">{{ day.gapLabel }}</span>
      <div class="rule" />
    </div>

    <div class="day-head">
      <h2 class="weekday" :class="{ 'is-today': day.isToday }">{{ day.weekday }}</h2>
      <span class="date">{{ day.date }}</span>
      <span v-if="day.isToday" class="badge">Today</span>
      <div class="no-print add-slot">
        <button
          v-if="trip.editing"
          class="btn is-primary add"
          title="Add an item on this day"
          aria-label="Add an item on this day"
          @click="emit('add', day.dayIso)"
        >
          +
        </button>
      </div>
    </div>

    <EntryRow v-for="view in day.entries" :key="view.entry.id" :view="view" />
  </section>
</template>

<style scoped>
.day {
  margin-bottom: 38px;
}

.gap-rule {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: -26px 0 11px;
}

.rule {
  flex: 1;
  height: 1px;
  background: var(--rule);
}

.gap-label {
  font-size: 10.5px;
  color: var(--muted);
  white-space: nowrap;
  letter-spacing: 0.05em;
}

.day-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding-bottom: 2px;
}

.weekday {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
  letter-spacing: -0.01em;
  color: var(--fg);
}

.weekday.is-today {
  color: var(--accent);
}

.date {
  font-size: 15px;
  color: var(--muted);
}

.badge {
  align-self: center;
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 650;
  color: var(--accent);
  border: 1px solid color-mix(in oklab, var(--accent) 40%, transparent);
  background: color-mix(in oklab, var(--accent) 10%, transparent);
  border-radius: 99px;
  padding: 1px 7px;
}

/* Held open whether or not the button is there, so turning editing on does not
   nudge the date sideways. */
.add-slot {
  margin-left: auto;
  align-self: center;
  width: 26px;
  height: 26px;
  display: flex;
}

.add {
  border-radius: 7px;
  width: 26px;
  height: 26px;
  padding: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1;
}

@media print {
  .day {
    break-inside: avoid;
    page-break-inside: avoid;
  }
}

@media screen and (max-width: 860px) {
  .day {
    margin-bottom: 14px;
  }

  .gap-rule {
    margin: -4px 0 9px;
  }

  .day-head {
    padding-bottom: 6px;
  }
}
</style>

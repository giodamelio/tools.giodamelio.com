<script setup lang="ts">
import { computed, ref } from "vue";
import { EVERYONE } from "../types";
import { useTripStore } from "../stores/trip";
import { chipStyle } from "../lib/present";

const people = defineModel<string[]>({ required: true });

const props = withDefaults(defineProps<{ scope: string; withAdd?: boolean }>(), {
  withAdd: false,
});

const trip = useTripStore();
const draftName = ref("");

const names = computed(() => [EVERYONE, ...trip.rosterNames]);

function isOn(name: string): boolean {
  return people.value.includes(name);
}

function style(name: string) {
  return chipStyle(name, isOn(name), trip.palette);
}

function toggle(name: string) {
  people.value = trip.togglePerson(props.scope, people.value, name, !isOn(name));
}

function addPerson() {
  const name = draftName.value.trim();
  if (!trip.addToRoster(name)) return;
  people.value = trip.togglePerson(props.scope, people.value, name, true);
  draftName.value = "";
}
</script>

<template>
  <div class="who-chips">
    <button
      v-for="name in names"
      :key="name"
      class="chip"
      :style="style(name)"
      @click="toggle(name)"
    >
      <svg v-if="isOn(name)" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="6" fill="currentColor" />
        <path
          d="M7.6 12.4l3 3 5.8-6.4"
          fill="none"
          stroke="var(--bg)"
          stroke-width="2.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <svg v-else viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
        <rect
          x="3"
          y="3"
          width="18"
          height="18"
          rx="6"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
        />
      </svg>
      {{ name }}
    </button>

    <input
      v-if="withAdd"
      v-model="draftName"
      class="chip-input"
      placeholder="+ add person"
      @keydown.enter.prevent="addPerson"
    />
  </div>
</template>

<style scoped>
.who-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

@media screen and (max-width: 860px) {
  .who-chips .chip,
  .who-chips .chip-input {
    min-height: 32px;
  }
}
</style>

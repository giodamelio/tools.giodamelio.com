<script setup lang="ts">
import { computed, ref } from "vue";
import type { LibraryItem } from "../types";
import { UNTITLED } from "../lib/doc";
import { shortStamp } from "../lib/time";
import { tripPath, tripUrl } from "../router";
import { shareLink } from "../lib/share";
import InfoTip from "./InfoTip.vue";

const props = defineProps<{ item: LibraryItem }>();
const emit = defineEmits<{ forget: []; delete: [] }>();

const menuOpen = ref(false);
const shared = ref(false);

const title = computed(() => props.item.title || UNTITLED);
const owned = computed(() => props.item.role === "owner" && !!props.item.key);
const note = computed(() =>
  props.item.modified ? `Edited ${shortStamp(props.item.modified)}` : "Not opened yet",
);

async function share() {
  menuOpen.value = false;
  const how = await shareLink(tripUrl(props.item.id, false), props.item.title);
  if (how !== "copied") return;
  shared.value = true;
  setTimeout(() => (shared.value = false), 1800);
}

function choose(what: "forget" | "delete") {
  menuOpen.value = false;
  if (what === "forget") emit("forget");
  else emit("delete");
}
</script>

<template>
  <li class="row">
    <RouterLink class="main" :to="tripPath(item.id, false)">
      <span class="title">{{ title }}</span>
      <span class="note">{{ note }}</span>
    </RouterLink>

    <RouterLink class="view" :to="tripPath(item.id, false)">View</RouterLink>

    <span class="more">
      <button
        class="btn is-muted is-icon is-bare"
        title="More"
        aria-label="More"
        @click="menuOpen = !menuOpen"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>

      <template v-if="menuOpen">
        <span class="menu-scrim" @click="menuOpen = false" />
        <span class="menu">
          <RouterLink
            v-if="owned"
            class="menu-item"
            :to="tripPath(item.id, true)"
            @click="menuOpen = false"
          >
            Edit
          </RouterLink>
          <button class="menu-item" @click="share">
            {{ shared ? "Link copied" : "Share" }}
          </button>

          <span class="menu-rule" />

          <span class="pair">
            <button class="menu-item grow" @click="choose('forget')">
              Forget on this device
            </button>
            <InfoTip label="What does forgetting do?">
              Takes it off this list, on this device only. The itinerary itself stays put and
              any link you shared keeps working — but you give up the ability to change it, and
              that cannot be undone.
            </InfoTip>
          </span>

          <span v-if="owned" class="pair">
            <button class="menu-item grow is-danger" @click="choose('delete')">
              Delete for everyone
            </button>
            <InfoTip label="What does deleting do?" danger>
              Erases the itinerary itself. Everyone you gave the link to loses it too, not just
              you. There is no undo.
            </InfoTip>
          </span>
        </span>
      </template>
    </span>
  </li>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--card);
  padding: 12px 12px 12px 16px;
}

.main {
  min-width: 0;
  flex: 1 1 auto;
  text-decoration: none;
  color: inherit;
}

.main:hover {
  color: inherit;
}

.title {
  display: block;
  font-size: 15px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note {
  display: block;
  font-size: 12px;
  color: var(--muted);
  margin-top: 2px;
}

.view {
  flex: 0 0 auto;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 13px;
  color: var(--fg);
  text-decoration: none;
}

.view:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.more {
  flex: 0 0 auto;
  position: relative;
  display: flex;
}

.is-bare {
  background: transparent;
  border-color: transparent;
}

.is-bare:hover {
  border-color: var(--border);
}

.menu {
  top: calc(100% + 6px);
  right: 0;
  min-width: 210px;
}

.pair {
  display: flex;
  align-items: stretch;
  gap: 2px;
}

.grow {
  flex: 1 1 auto;
  white-space: nowrap;
}

.menu-item.is-danger {
  color: var(--danger);
}

.menu-item.is-danger:hover {
  background: color-mix(in oklab, var(--danger) 12%, transparent);
  color: var(--danger);
}
</style>

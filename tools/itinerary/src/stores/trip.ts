import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import type { AgentKey, Entry, SaveState, SmartAction, TripState } from "../types";
import { colorMap, fromDoc, nextPeople, rosterOrder, toDoc } from "../lib/doc";
import { mintAgentKey, readBlob, writeBlob } from "../lib/keeper";
import { newEntryId } from "../lib/id";
import { router, tripPath } from "../router";
import { useLibraryStore } from "./library";

const SAVE_DEBOUNCE_MS = 700;
const AGENT_KEY_SECONDS = 3600;

function reason(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const useTripStore = defineStore("trip", () => {
  const library = useLibraryStore();

  const title = ref("");
  const entries = ref<Entry[]>([]);
  const roster = ref<string[]>([]);
  const colors = ref<Record<string, number>>({});
  const tzMode = ref("local");

  const blobId = ref<string | null>(null);
  const canEdit = ref(false);
  const loading = ref(true);
  const loadError = ref("");

  const saveState = ref<SaveState>("idle");
  const saveError = ref("");

  const agentKey = ref<AgentKey | null>(null);
  const agentBusy = ref(false);
  const agentError = ref("");

  /* Which entry has its editor open, and which has its carrier popover open.
     Trip-wide because only one of each may be open at a time. */
  const openId = ref<string | null>(null);
  const detailId = ref<string | null>(null);

  /* Which date popover is open, and the month it is showing. Trip-wide for the
     same reason, and because moving an entry to another day regroups the list
     and remounts the row underneath it — a popover that lived in the row would
     shut the moment you picked a date. */
  const openPicker = ref<string | null>(null);
  const pickerMonth = ref("");

  const state = computed<TripState>(() => ({
    title: title.value,
    roster: roster.value,
    colors: colors.value,
    tzMode: tzMode.value,
    entries: entries.value,
  }));

  const doc = computed(() => toDoc(state.value));
  const docJson = computed(() => JSON.stringify(doc.value));
  const rosterNames = computed(() => rosterOrder(state.value));
  const palette = computed(() => colorMap(state.value));

  /* Editing is a mode of the URL, not a flag beside it, so the back button
     leaves it the same way it arrived. */
  const editing = computed(
    () => canEdit.value && router.currentRoute.value.params.edit === "edit",
  );

  const tripZones = computed(() => {
    const seen: string[] = [];
    for (const entry of entries.value) {
      for (const zone of [entry.startTz, entry.endTz]) {
        if (zone && !seen.includes(zone)) seen.push(zone);
      }
    }
    return seen;
  });

  // ── Saving ───────────────────────────────────────────────────────────────

  let baseline = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<boolean> | null = null;
  let again = false;

  /* Nothing reaches the store until the itinerary itself changes, so reading a
     trip — or toggling the theme — never writes. */
  watch(docJson, (next) => {
    if (loading.value || !canEdit.value) return;
    if (next === baseline) return;
    clearTimeout(timer);
    timer = setTimeout(() => void saveNow(), SAVE_DEBOUNCE_MS);
    if (saveState.value !== "unsaved") saveState.value = "unsaved";
  });

  function saveNow(): Promise<boolean> {
    clearTimeout(timer);
    if (inFlight) {
      again = true;
      return inFlight;
    }

    const snapshot = doc.value;
    const body = docJson.value;
    if (body === baseline) return Promise.resolve(true);
    if (!canEdit.value || !blobId.value) return Promise.resolve(false);

    again = false;
    saveState.value = "saving";
    saveError.value = "";

    inFlight = (async () => {
      try {
        const id = blobId.value as string;
        const key = library.keyFor(id);
        if (!key) throw new Error("this browser can no longer edit it");
        const modified = await writeBlob(id, key, snapshot);
        library.remember(id, { title: snapshot.title, modified });
        baseline = body;
        saveState.value = "saved";
        return true;
      } catch (err) {
        saveState.value = "error";
        saveError.value = reason(err);
        return false;
      } finally {
        inFlight = null;
        if (again) void saveNow();
      }
    })();

    return inFlight;
  }

  // ── Loading ──────────────────────────────────────────────────────────────

  function adopt(next: TripState) {
    title.value = next.title;
    entries.value = next.entries;
    roster.value = next.roster;
    colors.value = next.colors;
    tzMode.value = next.tzMode;
  }

  async function load(id: string): Promise<void> {
    loading.value = true;
    loadError.value = "";
    openId.value = null;
    detailId.value = null;
    openPicker.value = null;
    agentKey.value = null;

    try {
      const found = await readBlob(id);
      if (!found) throw new Error("it was deleted, or the link is wrong");
      adopt(fromDoc(found.doc));
      blobId.value = id;
      canEdit.value = !!library.keyFor(id);
      baseline = docJson.value;
      saveState.value = "idle";
    } catch (err) {
      /* A link that cannot be opened shows the reason and nothing else —
         rendering someone else's trip underneath would read as their data. */
      adopt({ title: "", roster: [], colors: {}, tzMode: "local", entries: [] });
      blobId.value = null;
      canEdit.value = false;
      loadError.value = `This itinerary could not be opened — ${reason(err)}.`;
    } finally {
      loading.value = false;
    }
  }

  function setEditing(next: boolean): void {
    if (!canEdit.value || !blobId.value) return;
    openId.value = null;
    void router.replace(tripPath(blobId.value, next));
  }

  // ── Editing ──────────────────────────────────────────────────────────────

  function patchEntry(id: string, patch: Partial<Entry>): void {
    entries.value = entries.value.map((e) => (e.id === id ? { ...e, ...patch } : e));
  }

  function addEntry(entry: Entry): void {
    entries.value = [...entries.value, entry];
    openId.value = null;
  }

  function removeEntry(id: string): void {
    entries.value = entries.value.filter((e) => e.id !== id);
    if (openId.value === id) openId.value = null;
  }

  function addToRoster(name: string): boolean {
    const trimmed = name.trim();
    if (!trimmed) return false;
    if (!roster.value.includes(trimmed)) roster.value = [...roster.value, trimmed];
    return true;
  }

  /* "Everyone" is a sentinel that replaces the list. Turning it off restores
     whatever it displaced, per chip row, for as long as the page is open. */
  const displaced = new Map<string, string[]>();

  function togglePerson(
    scope: string,
    current: readonly string[],
    name: string,
    on: boolean,
  ): string[] {
    return nextPeople(current, name, on, {
      get: () => displaced.get(scope),
      set: (value) => {
        if (value) displaced.set(scope, value);
        else displaced.delete(scope);
      },
    });
  }

  function setEntryPerson(id: string, name: string, on: boolean): void {
    const entry = entries.value.find((e) => e.id === id);
    if (!entry) return;
    patchEntry(id, { people: togglePerson(`entry:${id}`, entry.people, name, on) });
  }

  function applyActions(actions: readonly SmartAction[]): void {
    let next = entries.value.slice();
    for (const action of actions) {
      if (action.kind === "add") {
        next = next.concat([{ id: newEntryId(), ...action.entry } as Entry]);
      } else if (action.kind === "update") {
        next = next.map((e) => (e.id === action.id ? { ...e, ...action.fields } : e));
      } else if (action.kind === "people") {
        next = next.map((e) => (e.id === action.id ? { ...e, people: action.people } : e));
      } else {
        next = next.filter((e) => e.id !== action.id);
      }
    }
    entries.value = next;
  }

  // ── Handing off to an agent ──────────────────────────────────────────────

  /* Minted as the handoff opens so the prompt is ready to copy. A key from
     earlier in this session is reused while it still has real time on it,
     rather than leaving a trail of live keys behind every time the dialog is
     opened. */
  async function mintKeyForAgent(): Promise<boolean> {
    const live = agentKey.value;
    if (live && Date.parse(live.expires_at) - Date.now() > 60_000) return true;
    if (agentBusy.value) return false;

    agentBusy.value = true;
    agentError.value = "";
    try {
      const saved = await saveNow();
      if (!saved) throw new Error("the itinerary could not be saved first");
      const id = blobId.value;
      if (!id) throw new Error("the itinerary has no link yet");
      agentKey.value = await mintAgentKey(id, library.keyFor(id), AGENT_KEY_SECONDS);
      return true;
    } catch (err) {
      agentError.value = `Could not set up access for the assistant — ${reason(err)}.`;
      return false;
    } finally {
      agentBusy.value = false;
    }
  }

  return {
    title,
    entries,
    roster,
    colors,
    tzMode,
    blobId,
    canEdit,
    loading,
    loadError,
    saveState,
    saveError,
    agentKey,
    agentBusy,
    agentError,
    openId,
    detailId,
    openPicker,
    pickerMonth,
    doc,
    rosterNames,
    palette,
    editing,
    tripZones,
    load,
    saveNow,
    setEditing,
    patchEntry,
    addEntry,
    removeEntry,
    addToRoster,
    togglePerson,
    setEntryPerson,
    applyActions,
    mintKeyForAgent,
  };
});

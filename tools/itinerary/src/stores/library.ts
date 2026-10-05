import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { Library, LibraryItem, TripDoc } from "../types";
import { createBlob, readBlob } from "../lib/keeper";
import { UNTITLED } from "../lib/doc";
import { readJson, writeJson } from "../lib/storage";

const LIBRARY_STORE = "itin-library";

/* The library is every itinerary this browser knows about. An "owner" carries
   the key that lets you write; a "viewer" is someone else's itinerary that was
   opened here by link, kept with an empty key so it renders read-only. */
function readLibrary(): Library {
  const stored = readJson<Library>(LIBRARY_STORE);
  if (!stored || !Array.isArray(stored.items)) return { v: 1, items: [] };
  return stored;
}

function writeLibrary(library: Library): void {
  writeJson(LIBRARY_STORE, library);
}

export const useLibraryStore = defineStore("library", () => {
  const items = ref<LibraryItem[]>(readLibrary().items);
  const busy = ref(false);

  const owned = computed(() => items.value.filter((it) => it.role === "owner"));
  const viewed = computed(() =>
    items.value
      .filter((it) => it.role === "viewer")
      .sort((a, b) => (b.viewed ?? "").localeCompare(a.viewed ?? "")),
  );

  function reload() {
    items.value = readLibrary().items;
  }

  function itemFor(id: string): LibraryItem | null {
    return items.value.find((it) => it.id === id) ?? null;
  }

  function keyFor(id: string): string {
    const item = itemFor(id);
    return item && item.role === "owner" && typeof item.key === "string" ? item.key : "";
  }

  function remember(id: string, patch: Partial<LibraryItem>): void {
    const library = readLibrary();
    const existing = library.items.find((it) => it.id === id);
    if (existing) Object.assign(existing, patch);
    else {
      library.items.push({
        id,
        role: "owner",
        key: "",
        title: "",
        created: "",
        modified: "",
        ...patch,
      });
    }
    writeLibrary(library);
    items.value = library.items;
  }

  /* Read fresh rather than from `items`: another tab may have created the
     itinerary since this one loaded, and an owner must never be demoted. */
  function noteViewed(id: string, title: string, modified: string): void {
    const existing = readLibrary().items.find((it) => it.id === id);
    if (existing?.role === "owner") return;
    remember(id, { role: "viewer", title, modified, viewed: new Date().toISOString() });
  }

  /* The copy is a new itinerary this browser owns; the original is only read. */
  async function duplicate(doc: TripDoc): Promise<string> {
    const copy = { ...doc, title: `Copy of ${doc.title || UNTITLED}` };
    const created = await createBlob(copy);
    remember(created.id, {
      role: "owner",
      key: created.edit_key,
      title: copy.title,
      created: created.created_at,
      modified: created.created_at,
    });
    return created.id;
  }

  function forget(id: string): void {
    const library = readLibrary();
    library.items = library.items.filter((it) => it.id !== id);
    writeLibrary(library);
    items.value = library.items;
  }

  /* One round trip per itinerary today. Kept behind a single call so it can
     become one bulk read when the store grows one. A trip that fails to load
     is left as it was rather than dropped: the network is the likely fault,
     not the itinerary. */
  async function refresh(): Promise<void> {
    reload();
    if (!items.value.length) return;

    busy.value = true;
    try {
      const reads = await Promise.all(
        items.value.map(async (item) => {
          try {
            const found = await readBlob(item.id);
            return found ? { id: item.id, ...found } : null;
          } catch {
            return null;
          }
        }),
      );

      const found = reads.filter((r) => r !== null);
      if (!found.length) return;

      const library = readLibrary();
      for (const { id, doc, modified } of found) {
        const row = library.items.find((it) => it.id === id);
        if (!row) continue;
        const title = (doc as { title?: unknown } | null)?.title;
        row.title = typeof title === "string" ? title : "";
        if (modified) row.modified = new Date(modified).toISOString();
      }
      writeLibrary(library);
      items.value = library.items;
    } finally {
      busy.value = false;
    }
  }

  return {
    items,
    owned,
    viewed,
    busy,
    reload,
    itemFor,
    keyFor,
    remember,
    noteViewed,
    duplicate,
    forget,
    refresh,
  };
});

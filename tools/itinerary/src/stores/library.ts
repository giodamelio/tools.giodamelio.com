import { defineStore } from "pinia";
import { ref } from "vue";
import type { Library, LibraryItem } from "../types";
import { readBlob } from "../lib/keeper";
import { readJson, writeJson } from "../lib/storage";

const LIBRARY_STORE = "itin-library";

/* The library is every itinerary this browser knows about. `role` is "owner"
   today and carries the key that lets you write. It is the seam for following
   someone else's itinerary later — such a record would drop `key` and render
   without the editing affordances. */
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

  return { items, busy, reload, itemFor, keyFor, remember, forget, refresh };
});

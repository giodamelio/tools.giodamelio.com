import { nextTick, ref } from "vue";

/* One dropdown serves the toolbar and every date popover, positioned against
   whichever control opened it. A module-level singleton so opening a second
   one closes the first without anybody having to arrange it. */
const open = ref(false);
const allowLocal = ref(false);
const position = ref("");
const query = ref("");
const active = ref(0);

let onPick: ((id: string) => void) | null = null;

function place(anchor: HTMLElement): string {
  const rect = anchor.getBoundingClientRect();
  const width = Math.round(Math.min(340, Math.max(268, rect.width)));
  const left = Math.round(Math.min(Math.max(8, rect.left), window.innerWidth - width - 8));
  const below = window.innerHeight - rect.bottom - 14;
  const above = rect.top - 14;
  const dropUp = below < 240 && above > below;

  const vertical = dropUp
    ? `bottom:${Math.round(window.innerHeight - rect.top + 6)}px`
    : `top:${Math.round(rect.bottom + 6)}px`;
  const maxHeight = Math.round(Math.max(220, dropUp ? above : below));

  return `${vertical};left:${left}px;width:${width}px;max-height:${maxHeight}px`;
}

export function useZoneChooser() {
  function openAt(
    anchor: HTMLElement,
    options: { allowLocal: boolean },
    pick: (id: string) => void,
  ): void {
    onPick = pick;
    allowLocal.value = options.allowLocal;
    position.value = place(anchor);
    query.value = "";
    active.value = 0;
    open.value = true;

    void nextTick(() => document.getElementById("zone-search")?.focus());
  }

  function close(): void {
    onPick = null;
    open.value = false;
    query.value = "";
    active.value = 0;
  }

  function pick(id: string): void {
    const chosen = onPick;
    close();
    chosen?.(id);
  }

  function move(delta: number, count: number): void {
    if (!count) return;
    active.value = Math.max(0, Math.min(count - 1, active.value + delta));
    void nextTick(() =>
      document.querySelector('[data-zone-active="yes"]')?.scrollIntoView({ block: "nearest" }),
    );
  }

  return { open, allowLocal, position, query, active, openAt, close, pick, move };
}

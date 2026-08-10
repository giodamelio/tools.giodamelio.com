import { onScopeDispose, watch, type Ref } from "vue";
import type { View } from "../stores/settings";

const STYLE_ID = "itin-page-size";

/* `@page` takes no selector, so the sheet's orientation cannot be a class —
   the rule itself has to change. A calendar wants landscape; a list does not. */
export function usePrintPageSize(view: Ref<View>): void {
  watch(
    view,
    (next) => {
      let style = document.getElementById(STYLE_ID);
      if (!style) {
        style = document.createElement("style");
        style.id = STYLE_ID;
        document.head.appendChild(style);
      }
      style.textContent =
        next === "calendar"
          ? "@page { size: landscape; margin: 0 } @media print { .sheet { padding: 11mm 12mm !important } }"
          : "@page { size: portrait; margin: 0 } @media print { .sheet { padding: 14mm 16mm !important } }";
    },
    { immediate: true },
  );

  onScopeDispose(() => document.getElementById(STYLE_ID)?.remove());
}

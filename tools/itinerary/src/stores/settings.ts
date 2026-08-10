import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { DEFAULT_MODEL, MODELS } from "../lib/schema";
import { readText, removeText, writeText } from "../lib/storage";

export type Theme = "dark" | "light";
export type View = "list" | "calendar";

const THEME_KEY = "itin-theme";
const VIEW_KEY = "itin-view";
const API_KEY = "itin-or-key";
const MODEL_KEY = "itin-or-model";

function storedTheme(): Theme {
  const stored = readText(THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/* How one person likes to read a trip, not part of the trip, so all of this
   stays in this browser and never reaches the server. */
export const useSettingsStore = defineStore("settings", () => {
  const theme = ref<Theme>(storedTheme());
  const view = ref<View>(readText(VIEW_KEY) === "calendar" ? "calendar" : "list");
  const apiKey = ref(readText(API_KEY) ?? "");
  const model = ref(readText(MODEL_KEY) || DEFAULT_MODEL);

  watch(
    theme,
    (next) => {
      writeText(THEME_KEY, next);
      document.documentElement.setAttribute("data-theme", next);
    },
    { immediate: true },
  );

  watch(view, (next) => writeText(VIEW_KEY, next));

  function toggleTheme() {
    theme.value = theme.value === "dark" ? "light" : "dark";
  }

  function saveSmartAdd(key: string, chosen: string) {
    apiKey.value = key.trim();
    model.value = chosen.trim() || DEFAULT_MODEL;
    writeText(API_KEY, apiKey.value);
    writeText(MODEL_KEY, model.value);
  }

  function clearApiKey() {
    apiKey.value = "";
    removeText(API_KEY);
  }

  function labelFor(id: string): string {
    return MODELS.find((m) => m.id === id)?.label ?? id;
  }

  return { theme, view, apiKey, model, toggleTheme, saveSmartAdd, clearApiKey, labelFor };
});

import js from "@eslint/js";
import pluginVue from "eslint-plugin-vue";
import { defineConfigWithVueTs, vueTsConfigs } from "@vue/eslint-config-typescript";
import skipFormatting from "@vue/eslint-config-prettier/skip-formatting";

export default defineConfigWithVueTs(
  {
    name: "itinerary/files",
    files: ["**/*.ts", "**/*.vue"],
  },
  {
    name: "itinerary/ignores",
    ignores: ["dist/**", "src/lib/zone-data.ts"],
  },
  js.configs.recommended,
  pluginVue.configs["flat/recommended"],
  vueTsConfigs.recommended,
  skipFormatting,
);

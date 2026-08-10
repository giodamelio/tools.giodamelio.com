import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";
import vue from "@vitejs/plugin-vue";

/* index.html carries `@basePath@` in its <base> tag for the Nix derivation to
   substitute. The dev server has no derivation, so point it at the root. */
function basePlaceholder(): Plugin {
  return {
    name: "itinerary-base-placeholder",
    apply: "serve",
    transformIndexHtml(html) {
      return html.replace("@basePath@", "/");
    },
  };
}

export default defineConfig({
  // Relative asset URLs resolve against <base>, so the same build works at any
  // mount point and at any depth below it.
  base: "./",

  plugins: [vue(), basePlaceholder()],

  build: {
    target: "es2022",
  },

  server: {
    // `nix run .#serve` in another terminal backs this with the real worker.
    proxy: {
      "/api": "http://localhost:8788",
    },
  },

  test: {
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
  },
});

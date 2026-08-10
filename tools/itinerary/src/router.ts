import { createRouter, createWebHistory } from "vue-router";

/* Where this tool is mounted, from the <base> tag the build stamps in. The
   tool never hardcodes its own prefix, so it can be served from anywhere. */
const BASE = new URL(document.baseURI).pathname;

/* The same pattern the derivation publishes for the worker to route on, so the
   two cannot drift: the worker serves this page for a trip permalink and the
   router picks it up from there. */
const ID = "[23456789bcdfghjkmnpqrstvwxz]{14}";

export const router = createRouter({
  history: createWebHistory(BASE),
  routes: [
    {
      path: "/",
      name: "library",
      component: () => import("./views/LibraryView.vue"),
    },
    {
      // One record for both the read-only and the editing URL: switching
      // between them is a mode, not a different page, and must not reload.
      path: `/:id(${ID})/:edit(edit)?`,
      name: "trip",
      component: () => import("./views/TripView.vue"),
    },
    {
      path: "/:rest(.*)",
      redirect: { name: "library" },
    },
  ],
});

/* Router paths are relative to the history base, so this is what `to` and
   `router.replace` take — never the mounted path, which the router would read
   as a route of its own and fail to match.

   Written out rather than resolved from the route: the optional `edit` segment
   is one record so that switching modes does not remount the page, and
   router.resolve cannot write that segment back out. */
export function tripPath(id: string, editing: boolean): string {
  return `/${id}${editing ? "/edit" : ""}`;
}

/* The mounted path, for a link someone else will open. */
export function tripUrl(id: string, editing: boolean): string {
  return `${location.origin}${BASE}${id}${editing ? "/edit" : ""}`;
}

/* Served from the mount root, and shown to an agent, so it has to be absolute. */
export const LLM_DOC = new URL("llm.md", document.baseURI).href;

import { handleKeeperOfState } from "./keeper-of-state/routes.js";

// /itinerary/<id> and /itinerary/<id>/edit are read by the page off its own
// path. Matching the id alphabet exactly keeps this from shadowing the real
// assets that sit alongside it, like /itinerary/render.js.
const ITINERARY_PAGE = /^\/itinerary\/[23456789bcdfghjkmnpqrstvwxz]{14}(?:\/edit)?\/?$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (
      url.pathname === "/api/keeper-of-state" ||
      url.pathname.startsWith("/api/keeper-of-state/")
    ) {
      return handleKeeperOfState(request, env, url);
    }

    if (ITINERARY_PAGE.test(url.pathname)) {
      return env.ASSETS.fetch(new Request(new URL("/itinerary/", url), request));
    }

    return env.ASSETS.fetch(request);
  },
};

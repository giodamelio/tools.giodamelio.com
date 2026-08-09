import { handleKeeperOfState } from "./keeper-of-state/routes.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (
      url.pathname === "/api/keeper-of-state" ||
      url.pathname.startsWith("/api/keeper-of-state/")
    ) {
      return handleKeeperOfState(request, env, url);
    }

    return env.ASSETS.fetch(request);
  },
};

import { handleKeeperOfState } from "./keeper-of-state/routes.js";
import { TOOL_ROUTES } from "./tool-routes.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (
      url.pathname === "/api/keeper-of-state" ||
      url.pathname.startsWith("/api/keeper-of-state/")
    ) {
      return handleKeeperOfState(request, env, url);
    }

    // Tools that own sub-paths — a permalink, an editor — declare them in
    // their derivation and get their own index.html served for the match.
    const route = TOOL_ROUTES.find((candidate) => candidate.pattern.test(url.pathname));
    if (route) {
      return env.ASSETS.fetch(new Request(new URL(route.page, url), request));
    }

    return env.ASSETS.fetch(request);
  },
};

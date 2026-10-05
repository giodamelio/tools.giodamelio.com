import { handleKeeperOfState } from "./keeper-of-state/routes.js";
import { TOOL_ROUTES } from "./tool-routes.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (
      url.pathname === "/api/keeper-of-state" ||
      url.pathname.startsWith("/api/keeper-of-state/")
    ) {
      return handleKeeperOfState(request, env, url);
    }

    // Tools that own sub-paths — a permalink, an editor — declare them in
    // their derivation and get their own index.html served for the match.
    // A tool with a preview Worker also answers some paths itself and adds
    // link-preview tags to its pages; see worker/tool-routes.js.tmpl.
    const route = TOOL_ROUTES.find((candidate) => candidate.pattern.test(url.pathname));
    if (route?.service) {
      return serveCached(request, binding(env, route.service), ctx);
    }
    if (route) {
      const page = env.ASSETS.fetch(new Request(new URL(route.page, url), request));
      return route.preview ? withPreviewTags(page, binding(env, route.preview), url) : page;
    }

    return env.ASSETS.fetch(request);
  },
};

function binding(env, name) {
  const service = env[name];
  if (!service) {
    throw new Error(`The ${name} service binding is not configured in worker/wrangler.jsonc.`);
  }
  return service;
}

// A response the service marks immutable is cached in this data centre, so
// every later request for it skips the service entirely.
async function serveCached(request, service, ctx) {
  if (request.method !== "GET") {
    return service.fetch(request);
  }
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  const response = await service.fetch(request);
  if (response.ok && /\bimmutable\b/.test(response.headers.get("cache-control") ?? "")) {
    ctx.waitUntil(cache.put(request, response.clone()));
  }
  return response;
}

// The preview Worker answers with the page's tags as a list of attribute
// maps. A page it does not know gets no tags; any other failure fails the
// page, so a broken preview is noticed rather than silently dropped.
async function withPreviewTags(pageResponse, preview, url) {
  const [page, meta] = await Promise.all([
    pageResponse,
    preview.fetch(`https://preview/meta?url=${encodeURIComponent(url.href)}`),
  ]);
  if (meta.status === 404) {
    return page;
  }
  if (!meta.ok) {
    return new Response(`Link preview tags failed with ${meta.status}: ${await meta.text()}`, {
      status: 502,
    });
  }
  const tags = await meta.json();
  const html = tags.map(metaTag).join("");
  return new HTMLRewriter()
    .on("head", {
      element(head) {
        head.append(html, { html: true });
      },
    })
    .transform(page);
}

const ATTRIBUTE_NAME = /^[a-z][a-z:-]*$/;

function metaTag(attributes) {
  const pairs = Object.entries(attributes).map(([name, value]) => {
    if (!ATTRIBUTE_NAME.test(name)) {
      throw new Error(`Invalid meta attribute name from the preview Worker: ${name}`);
    }
    return `${name}="${escapeAttribute(String(value))}"`;
  });
  return `<meta ${pairs.join(" ")}>`;
}

function escapeAttribute(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

import docsMarkdown from "./docs.md";
import openapiYaml from "./openapi.yaml";
import { authorize, authorizeSelfRevoke, createOwnerKey, mintTemporaryKey, revokeKeyById } from "./auth.js";
import { apiError, isValidApp, json, noContent, readJsonObject, textResponse } from "./http.js";
import { createBlob, getBlob, replaceBlob, softDeleteBlob } from "./store.js";

const PREFIX = "/api/keeper-of-state";
const DISCOVERY_CACHE_CONTROL = "public, max-age=300";
const PATCH_CONTENT_TYPES = ["application/json", "application/merge-patch+json"];

function httpDate(iso) {
  return new Date(iso).toUTCString();
}

function methodNotAllowed(allowed) {
  const response = apiError(405, "method_not_allowed", `This endpoint accepts ${allowed.join(", ")}.`);
  response.headers.set("allow", allowed.join(", "));
  return response;
}

function notFound() {
  return apiError(404, "not_found", "No blob with that app and id.");
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergePatch(target, patch) {
  if (!isPlainObject(patch)) return patch;

  const result = isPlainObject(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    // RFC 7386: a null member removes the key instead of setting it to null.
    if (value === null) {
      delete result[key];
    } else {
      result[key] = mergePatch(result[key], value);
    }
  }
  return result;
}

async function create(request, env, url, app) {
  if (!env.KEEPER_CREATE) {
    throw new Error("The KEEPER_CREATE rate limit binding is not configured.");
  }

  const { success } = await env.KEEPER_CREATE.limit({
    key: request.headers.get("CF-Connecting-IP") ?? "unknown",
  });
  if (!success) {
    return apiError(429, "rate_limited", "Too many blobs created from this address. Try again shortly.");
  }

  if (!isValidApp(app)) {
    return apiError(400, "invalid_app", "The app namespace must match ^[a-z0-9-]{1,32}$.");
  }

  const body = await readJsonObject(request);
  if (!body.ok) return body.response;

  const { id, created_at } = await createBlob(env.DB, app, JSON.stringify(body.value));
  const { key } = await createOwnerKey(env.DB, id);
  const path = `${PREFIX}/${app}/${id}`;

  return json(
    { id, edit_key: key, url: `${url.origin}${path}`, created_at },
    { status: 201, headers: { location: path } },
  );
}

async function read(env, app, id) {
  const blob = await getBlob(env.DB, app, id);
  if (!blob) return notFound();

  return textResponse(blob.data, "application/json; charset=utf-8", {
    headers: { "last-modified": httpDate(blob.updated_at) },
  });
}

async function replace(request, env, app, id) {
  const blob = await getBlob(env.DB, app, id);
  if (!blob) return notFound();

  const auth = await authorize(env.DB, request, id, false);
  if (!auth.ok) return apiError(auth.status, auth.code, auth.message);

  const body = await readJsonObject(request);
  if (!body.ok) return body.response;

  const updatedAt = await replaceBlob(env.DB, id, JSON.stringify(body.value));
  const response = noContent();
  response.headers.set("last-modified", httpDate(updatedAt));
  return response;
}

async function patch(request, env, app, id) {
  const blob = await getBlob(env.DB, app, id);
  if (!blob) return notFound();

  const auth = await authorize(env.DB, request, id, false);
  if (!auth.ok) return apiError(auth.status, auth.code, auth.message);

  // A missing content-type is tolerated so an agent that forgets the header is not dead-ended.
  const contentType = request.headers.get("content-type");
  if (contentType !== null && !PATCH_CONTENT_TYPES.includes(contentType.split(";")[0].trim().toLowerCase())) {
    return apiError(
      415,
      "unsupported_media_type",
      `Use a content-type of ${PATCH_CONTENT_TYPES.join(" or ")}.`,
    );
  }

  const body = await readJsonObject(request);
  if (!body.ok) return body.response;

  const merged = mergePatch(JSON.parse(blob.data), body.value);
  const data = JSON.stringify(merged);
  const updatedAt = await replaceBlob(env.DB, id, data);

  return textResponse(data, "application/json; charset=utf-8", {
    headers: { "last-modified": httpDate(updatedAt) },
  });
}

async function remove(request, env, app, id) {
  const blob = await getBlob(env.DB, app, id);
  if (!blob) return notFound();

  const auth = await authorize(env.DB, request, id, true);
  if (!auth.ok) return apiError(auth.status, auth.code, auth.message);

  await softDeleteBlob(env.DB, id);
  return noContent();
}

async function mintKey(request, env, app, id) {
  const blob = await getBlob(env.DB, app, id);
  if (!blob) return notFound();

  const auth = await authorize(env.DB, request, id, true);
  if (!auth.ok) return apiError(auth.status, auth.code, auth.message);

  const body = await readJsonObject(request);
  if (!body.ok) return body.response;

  const minted = await mintTemporaryKey(env.DB, id, body.value.expires_in);
  if (!minted.ok) return apiError(minted.status, minted.code, minted.message);

  return json({ key: minted.key, expires_at: minted.expires_at }, { status: 201 });
}

async function revokeSelf(request, env, app, id) {
  const blob = await getBlob(env.DB, app, id);
  if (!blob) return notFound();

  const auth = await authorizeSelfRevoke(env.DB, request, id);
  if (!auth.ok) return apiError(auth.status, auth.code, auth.message);

  await revokeKeyById(env.DB, auth.key.id);
  return noContent();
}

export async function handleKeeperOfState(request, env, url) {
  const parts = url.pathname.slice(PREFIX.length).split("/").filter((part) => part !== "");
  const method = request.method;

  if (parts.length === 0) {
    if (method !== "GET") return methodNotAllowed(["GET"]);
    return json({
      docs: `${url.origin}${PREFIX}/docs.md`,
      openapi: `${url.origin}${PREFIX}/openapi.yaml`,
    });
  }

  if (parts.length === 1 && parts[0] === "openapi.yaml") {
    if (method !== "GET") return methodNotAllowed(["GET"]);
    return textResponse(openapiYaml, "application/yaml; charset=utf-8", {
      headers: { "cache-control": DISCOVERY_CACHE_CONTROL },
    });
  }

  if (parts.length === 1 && parts[0] === "docs.md") {
    if (method !== "GET") return methodNotAllowed(["GET"]);
    return textResponse(docsMarkdown, "text/markdown; charset=utf-8", {
      headers: { "cache-control": DISCOVERY_CACHE_CONTROL },
    });
  }

  if (parts.length === 1) {
    if (method !== "POST") return methodNotAllowed(["POST"]);
    return create(request, env, url, parts[0]);
  }

  if (parts.length === 2) {
    const [app, id] = parts;
    switch (method) {
      case "GET":
        return read(env, app, id);
      case "PUT":
        return replace(request, env, app, id);
      case "PATCH":
        return patch(request, env, app, id);
      case "DELETE":
        return remove(request, env, app, id);
      default:
        return methodNotAllowed(["GET", "PUT", "PATCH", "DELETE"]);
    }
  }

  if (parts.length === 3 && parts[2] === "keys") {
    if (method !== "POST") return methodNotAllowed(["POST"]);
    return mintKey(request, env, parts[0], parts[1]);
  }

  if (parts.length === 4 && parts[2] === "keys" && parts[3] === "self") {
    if (method !== "DELETE") return methodNotAllowed(["DELETE"]);
    return revokeSelf(request, env, parts[0], parts[1]);
  }

  return apiError(404, "not_found", "No such endpoint.");
}

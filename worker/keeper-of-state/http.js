export const MAX_BODY_BYTES = 102400;

const APP_PATTERN = /^[a-z0-9-]{1,32}$/;

export function json(data, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function noContent() {
  return new Response(null, { status: 204 });
}

export function apiError(status, code, message) {
  return json({ error: code, message }, { status });
}

export function textResponse(body, contentType, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", contentType);
  return new Response(body, { ...init, status: 200, headers });
}

export async function readJsonObject(request) {
  const text = await request.text();

  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    return {
      ok: false,
      response: apiError(413, "too_large", `Body exceeds the ${MAX_BODY_BYTES} byte limit.`),
    };
  }

  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return {
      ok: false,
      response: apiError(400, "invalid_json", "Body is not valid JSON."),
    };
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      response: apiError(400, "not_an_object", "Body must be a JSON object."),
    };
  }

  return { ok: true, value };
}

export function isValidApp(app) {
  return typeof app === "string" && APP_PATTERN.test(app);
}

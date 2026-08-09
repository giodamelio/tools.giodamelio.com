import { findKeyByHash, insertKey, nowIso, revokeKey } from "./store.js";

export const MAX_EXPIRES_IN = 86400;

const BEARER_PATTERN = /^\s*Bearer\s+(\S+)\s*$/i;

function deny(status, code, message) {
  return { ok: false, status, code, message };
}

function secondsIso(millis) {
  return `${new Date(millis).toISOString().slice(0, 19)}Z`;
}

export async function hashKey(plaintext) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(plaintext));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function bearerToken(request) {
  const header = request.headers.get("authorization");
  if (!header) return null;

  const match = BEARER_PATTERN.exec(header);
  return match ? match[1] : null;
}

async function lookupKey(db, request) {
  const token = bearerToken(request);
  if (!token) {
    return deny(401, "missing_key", "Provide the key as an Authorization: Bearer header.");
  }

  const key = await findKeyByHash(db, await hashKey(token));
  if (!key) {
    return deny(401, "unknown_key", "That key does not exist.");
  }

  return { ok: true, key };
}

export async function authorize(db, request, blobId, requireOwner) {
  const found = await lookupKey(db, request);
  if (!found.ok) return found;

  const { key } = found;

  // Revoked wins over expired so a revoked key that has also aged out still reads as revoked.
  if (key.revoked_at) {
    return deny(401, "key_revoked", "That key has been revoked.");
  }

  if (key.expires_at && Date.parse(key.expires_at) <= Date.now()) {
    return deny(401, "key_expired", "That key has expired.");
  }

  if (key.blob_id !== blobId) {
    return deny(403, "forbidden", "That key does not grant access to this blob.");
  }

  if (requireOwner && key.kind !== "owner") {
    return deny(403, "forbidden", "That action requires an owner key.");
  }

  return { ok: true, key };
}

// Self-revoke must be idempotent, so an already-revoked or expired key still succeeds and the
// caller sees 204 on retry rather than an error.
export async function authorizeSelfRevoke(db, request, blobId) {
  const found = await lookupKey(db, request);
  if (!found.ok) return found;

  const { key } = found;

  if (key.blob_id !== blobId) {
    return deny(403, "forbidden", "That key does not grant access to this blob.");
  }

  if (key.kind === "owner") {
    return deny(403, "forbidden", "Owner keys cannot be revoked.");
  }

  return { ok: true, key };
}

export async function createOwnerKey(db, blobId) {
  const key = crypto.randomUUID();
  await insertKey(db, blobId, await hashKey(key), "owner", null);
  return { key };
}

export async function mintTemporaryKey(db, blobId, expiresIn) {
  if (!Number.isInteger(expiresIn) || expiresIn <= 0) {
    return deny(400, "bad_request", "expires_in must be a positive integer number of seconds.");
  }

  if (expiresIn > MAX_EXPIRES_IN) {
    return deny(400, "bad_request", `expires_in must be at most ${MAX_EXPIRES_IN} seconds.`);
  }

  const expiresAt = secondsIso(Date.parse(nowIso()) + expiresIn * 1000);
  const key = crypto.randomUUID();
  await insertKey(db, blobId, await hashKey(key), "temporary", expiresAt);

  return { ok: true, key, expires_at: expiresAt };
}

export async function revokeKeyById(db, keyId) {
  await revokeKey(db, keyId);
}

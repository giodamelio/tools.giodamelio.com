const ALPHABET = "23456789bcdfghjkmnpqrstvwxz";
const ID_LENGTH = 14;
// Largest multiple of ALPHABET.length (27) that fits in a byte; higher bytes are rejected to keep the draw uniform.
const REJECT_AT = 243;

export function generateId() {
  let id = "";
  while (id.length < ID_LENGTH) {
    const bytes = new Uint8Array(ID_LENGTH - id.length);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= REJECT_AT) continue;
      id += ALPHABET[byte % ALPHABET.length];
    }
  }
  return id;
}

export function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export async function createBlob(db, app, data) {
  const id = generateId();
  const now = nowIso();
  await db
    .prepare(
      "INSERT INTO blobs (id, app, data, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)",
    )
    .bind(id, app, data, now, now)
    .run();
  return { id, created_at: now };
}

export async function getBlob(db, app, id) {
  return await db
    .prepare("SELECT * FROM blobs WHERE id = ? AND app = ? AND deleted_at IS NULL")
    .bind(id, app)
    .first();
}

export async function replaceBlob(db, id, data) {
  const updatedAt = nowIso();
  await db
    .prepare("UPDATE blobs SET data = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
    .bind(data, updatedAt, id)
    .run();
  return updatedAt;
}

export async function softDeleteBlob(db, id) {
  await db
    .prepare("UPDATE blobs SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL")
    .bind(nowIso(), id)
    .run();
}

export async function insertKey(db, blobId, keyHash, kind, expiresAt) {
  const id = generateId();
  const now = nowIso();
  await db
    .prepare(
      "INSERT INTO keys (id, blob_id, key_hash, kind, expires_at, revoked_at, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)",
    )
    .bind(id, blobId, keyHash, kind, expiresAt, now)
    .run();
  return { id, created_at: now };
}

export async function findKeyByHash(db, keyHash) {
  return await db.prepare("SELECT * FROM keys WHERE key_hash = ?").bind(keyHash).first();
}

export async function revokeKey(db, keyId) {
  await db
    .prepare("UPDATE keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL")
    .bind(nowIso(), keyId)
    .run();
}

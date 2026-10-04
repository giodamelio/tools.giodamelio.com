-- SQLite cannot alter a CHECK constraint, so the table is rebuilt to admit the invite kind.
CREATE TABLE keys_new (
  id          TEXT PRIMARY KEY,
  blob_id     TEXT NOT NULL REFERENCES blobs (id),
  key_hash    TEXT NOT NULL UNIQUE,
  kind        TEXT NOT NULL CHECK (kind IN ('owner', 'temporary', 'invite')),
  expires_at  TEXT,
  revoked_at  TEXT,
  redeemed_at TEXT,
  created_at  TEXT NOT NULL
);

INSERT INTO keys_new (id, blob_id, key_hash, kind, expires_at, revoked_at, redeemed_at, created_at)
SELECT id, blob_id, key_hash, kind, expires_at, revoked_at, NULL, created_at FROM keys;

DROP TABLE keys;
ALTER TABLE keys_new RENAME TO keys;
CREATE INDEX keys_blob ON keys (blob_id);

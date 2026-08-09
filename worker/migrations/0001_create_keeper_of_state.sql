CREATE TABLE blobs (
  id         TEXT PRIMARY KEY,
  app        TEXT NOT NULL,
  data       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX blobs_app ON blobs (app);

CREATE TABLE keys (
  id         TEXT PRIMARY KEY,
  blob_id    TEXT NOT NULL REFERENCES blobs (id),
  key_hash   TEXT NOT NULL UNIQUE,
  kind       TEXT NOT NULL CHECK (kind IN ('owner', 'temporary')),
  expires_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX keys_blob ON keys (blob_id);

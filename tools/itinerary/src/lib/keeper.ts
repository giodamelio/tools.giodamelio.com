import type { AgentKey, CreatedBlob, TripDoc } from "../types";

/* Absolute on purpose: the API is one thing wherever this tool is mounted. */
const API = "/api/keeper-of-state/itinerary";

export const BLOB_ID_RE = /^[23456789bcdfghjkmnpqrstvwxz]{14}$/;

/* The server answers with codes like `not_found`; none of that vocabulary
   belongs in front of someone planning a trip. */
const API_TROUBLE: Record<string, string> = {
  not_found: "this itinerary no longer exists",
  missing_key: "this browser is not allowed to change it",
  unknown_key: "this browser is not allowed to change it",
  key_expired: "the access being used has expired",
  key_revoked: "the access being used was withdrawn",
  forbidden: "this browser is not allowed to do that",
  rate_limited: "the server is asking you to slow down, so wait a minute",
  too_large: "this itinerary has grown too big to save",
};

export class KeeperError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "KeeperError";
    this.code = code;
    this.status = status;
  }
}

export async function apiFailure(res: Response): Promise<KeeperError> {
  let code = "";
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body?.error === "string") code = body.error;
  } catch {
    // A body that is not JSON tells us nothing the status does not.
  }
  return new KeeperError(
    API_TROUBLE[code] ?? `the server said ${res.status}`,
    code,
    res.status,
  );
}

function authorized(key: string, extra?: HeadersInit): HeadersInit {
  return { ...extra, Authorization: `Bearer ${key}` };
}

export async function createBlob(doc: TripDoc): Promise<CreatedBlob> {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(doc),
  });
  if (!res.ok) throw await apiFailure(res);
  return (await res.json()) as CreatedBlob;
}

export interface BlobRead {
  doc: unknown;
  modified: string;
}

/* A 404 is an answer, not a failure: the link is for something that is gone. */
export async function readBlob(id: string): Promise<BlobRead | null> {
  const res = await fetch(`${API}/${id}`);
  if (res.status === 404) return null;
  if (!res.ok) throw await apiFailure(res);
  return {
    doc: (await res.json()) as unknown,
    modified: res.headers.get("last-modified") ?? "",
  };
}

export async function writeBlob(id: string, key: string, doc: TripDoc): Promise<string> {
  const res = await fetch(`${API}/${id}`, {
    method: "PUT",
    headers: authorized(key, { "Content-Type": "application/json" }),
    body: JSON.stringify(doc),
  });
  if (!res.ok) throw await apiFailure(res);
  const stamp = res.headers.get("last-modified");
  return stamp ? new Date(stamp).toISOString() : "";
}

export async function deleteBlob(id: string, key: string): Promise<void> {
  const res = await fetch(`${API}/${id}`, {
    method: "DELETE",
    headers: authorized(key),
  });
  if (!res.ok) throw await apiFailure(res);
}

export async function mintAgentKey(
  id: string,
  key: string,
  seconds: number,
): Promise<AgentKey> {
  const res = await fetch(`${API}/${id}/keys`, {
    method: "POST",
    headers: authorized(key, { "Content-Type": "application/json" }),
    body: JSON.stringify({ expires_in: seconds }),
  });
  if (!res.ok) throw await apiFailure(res);
  return (await res.json()) as AgentKey;
}

/* Shown to an agent, so it has to be absolute. */
export function blobUrl(id: string): string {
  return `${location.origin}${API}/${id}`;
}

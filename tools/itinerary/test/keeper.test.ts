import { afterEach, describe, expect, it, vi } from "vitest";
import {
  KeeperError,
  apiFailure,
  createBlob,
  deleteBlob,
  mintAgentKey,
  readBlob,
  writeBlob,
} from "../src/lib/keeper";
import { emptyDoc } from "../src/lib/doc";

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
}

function stubFetch(...answers: Response[]) {
  const fetch = vi.fn<typeof globalThis.fetch>();
  for (const answer of answers) fetch.mockResolvedValueOnce(answer);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe("apiFailure", () => {
  const CODES: [string, string][] = [
    ["not_found", "this itinerary no longer exists"],
    ["missing_key", "this browser is not allowed to change it"],
    ["unknown_key", "this browser is not allowed to change it"],
    ["key_expired", "the access being used has expired"],
    ["key_revoked", "the access being used was withdrawn"],
    ["forbidden", "this browser is not allowed to do that"],
    ["rate_limited", "the server is asking you to slow down, so wait a minute"],
    ["too_large", "this itinerary has grown too big to save"],
  ];

  it.each(CODES)("says what %s means in plain words", async (code, prose) => {
    const failure = await apiFailure(respond(400, { error: code, message: "raw" }));
    expect(failure.message).toBe(prose);
    expect(failure.code).toBe(code);
  });

  it("falls back to the status for a code it does not know", async () => {
    const failure = await apiFailure(respond(503, { error: "on_fire" }));
    expect(failure.message).toBe("the server said 503");
  });

  it("falls back to the status when the body is not JSON", async () => {
    const failure = await apiFailure(new Response("<html>502</html>", { status: 502 }));
    expect(failure.message).toBe("the server said 502");
    expect(failure.status).toBe(502);
  });
});

describe("readBlob", () => {
  it("returns the document and its stamp", async () => {
    stubFetch(
      respond(200, { title: "Trip" }, { "last-modified": "Wed, 21 Oct 2026 07:28:00 GMT" }),
    );
    const found = await readBlob("3pwsf4hhwx5n6s");
    expect(found?.doc).toEqual({ title: "Trip" });
    expect(found?.modified).toBe("Wed, 21 Oct 2026 07:28:00 GMT");
  });

  /* A 404 is an answer — the link is for something gone — not a failure. */
  it("answers null for a link that leads nowhere", async () => {
    stubFetch(respond(404, { error: "not_found" }));
    expect(await readBlob("3pwsf4hhwx5n6s")).toBeNull();
  });

  it("throws on anything else", async () => {
    stubFetch(respond(500, { error: "boom" }));
    await expect(readBlob("3pwsf4hhwx5n6s")).rejects.toBeInstanceOf(KeeperError);
  });
});

describe("writeBlob", () => {
  it("sends the whole document with the key", async () => {
    const fetch = stubFetch(
      respond(200, {}, { "last-modified": "Wed, 21 Oct 2026 07:28:00 GMT" }),
    );
    const modified = await writeBlob("3pwsf4hhwx5n6s", "k-1", emptyDoc());

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/keeper-of-state/itinerary/3pwsf4hhwx5n6s");
    expect(init.method).toBe("PUT");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer k-1",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init.body as string)).toEqual(emptyDoc());
    expect(modified).toBe("2026-10-21T07:28:00.000Z");
  });

  it("throws rather than resolving when the key is refused", async () => {
    stubFetch(respond(403, { error: "unknown_key" }));
    await expect(writeBlob("3pwsf4hhwx5n6s", "", emptyDoc())).rejects.toThrow(
      "this browser is not allowed to change it",
    );
  });
});

describe("createBlob", () => {
  it("posts without a key and returns the new id", async () => {
    const fetch = stubFetch(
      respond(201, { id: "3pwsf4hhwx5n6s", edit_key: "k-1", created_at: "now", url: "u" }),
    );
    const created = await createBlob(emptyDoc());
    expect(created.id).toBe("3pwsf4hhwx5n6s");

    const [, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(init.headers).not.toHaveProperty("Authorization");
  });
});

describe("deleteBlob", () => {
  it("sends the key and nothing else", async () => {
    const fetch = stubFetch(respond(204, undefined));
    await deleteBlob("3pwsf4hhwx5n6s", "k-1");

    const [, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("DELETE");
    expect(init.headers).toEqual({ Authorization: "Bearer k-1" });
    expect(init.body).toBeUndefined();
  });
});

describe("mintAgentKey", () => {
  it("asks for a key that expires", async () => {
    const fetch = stubFetch(respond(201, { key: "agent-1", expires_at: "later" }));
    const minted = await mintAgentKey("3pwsf4hhwx5n6s", "k-1", 3600);
    expect(minted.key).toBe("agent-1");

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/keeper-of-state/itinerary/3pwsf4hhwx5n6s/keys");
    expect(JSON.parse(init.body as string)).toEqual({ expires_in: 3600 });
  });
});

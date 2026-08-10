import { blobUrl } from "./keeper";
import { agentExpiryLabel } from "./time";
import { LLM_DOC } from "../router";

/* Written for whoever the key is handed to, not for this app. It has to stand
   on its own in a chat window with no other context. */
export function agentPromptFor(id: string, key: string, expiresAt: string): string {
  const url = blobUrl(id);
  return [
    "You can edit my travel itinerary. It is a JSON document at",
    "",
    `  ${url}`,
    "",
    `Authorization: Bearer ${key}`,
    "",
    `That key works until ${agentExpiryLabel(expiresAt)}.`,
    "",
    "GET the URL to read the itinerary. PATCH it with a JSON merge patch (RFC 7386)",
    "and Content-Type: application/json to change it. A merge patch replaces whole",
    "arrays, so to touch one entry, read `entries`, edit it, and send the whole list back.",
    "",
    `The format is documented at ${LLM_DOC} — read it before you write.`,
    "",
    "When you are done, revoke the key:",
    "",
    `  DELETE ${url}/keys/self`,
    "",
    "Ask me what I want to change. I may paste in confirmation emails from airlines or hotels.",
  ].join("\n");
}

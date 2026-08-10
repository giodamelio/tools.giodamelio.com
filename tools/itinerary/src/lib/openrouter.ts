import type { Entry, SmartAction } from "../types";
import { DEFAULT_MODEL, SYSTEM_PROMPT } from "./schema";
import { newActionId } from "./id";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export interface SmartRequest {
  apiKey: string;
  model: string;
  prompt: string;
  knownIds: readonly string[];
}

interface ChatResponse {
  error?: { message?: string };
  choices?: { message?: { content?: string } }[];
}

/* Everything the model is told about the trip as it stands. Ids are in here
   because update, people and delete actions have to reference one. */
export function smartPrompt(
  entries: readonly Entry[],
  roster: readonly string[],
  text: string,
  note: string,
  today: string,
): string {
  const existing = entries.map((e) => ({
    id: e.id,
    type: e.type,
    start: e.start,
    startTz: e.startTz,
    end: e.end,
    endTz: e.endTz,
    from: e.from,
    to: e.to,
    operator: e.operator,
    service: e.service,
    name: e.name,
    people: e.people,
  }));

  const parts = [
    `Today is ${today}.`,
    `Known travelers: ${roster.join(", ") || "none yet"}.`,
    "The itinerary as it stands (ids are what update/people/delete must reference):",
    JSON.stringify(existing),
    "",
    "New text to turn into actions:",
    text || "(none — work only from the note below)",
  ];
  if (note.trim()) {
    parts.push(
      "",
      "The last set of actions was not right. Correction from the user:",
      note.trim(),
    );
  }
  return parts.join("\n");
}

/* A model that wraps its JSON in prose or a fence is still trying to answer;
   pull the object out rather than rejecting the whole reply. */
function extractJson(content: string): unknown {
  const body = content.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "");
  const open = body.indexOf("{");
  const close = body.lastIndexOf("}");
  if (open < 0 || close < open) {
    throw new Error(
      `The assistant did not answer in the expected form: ${content.slice(0, 300)}`,
    );
  }
  try {
    return JSON.parse(body.slice(open, close + 1));
  } catch {
    throw new Error(
      `The assistant did not answer in the expected form: ${content.slice(0, 300)}`,
    );
  }
}

function usableAction(action: unknown, knownIds: readonly string[]): action is SmartAction {
  if (!action || typeof action !== "object") return false;
  const a = action as { kind?: unknown; entry?: unknown; id?: unknown };
  if (a.kind === "add") return !!a.entry;
  return typeof a.id === "string" && knownIds.includes(a.id);
}

export async function requestActions(req: SmartRequest): Promise<SmartAction[]> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${req.apiKey}`,
      "HTTP-Referer": location.origin,
      "X-Title": "Itinerary",
    },
    body: JSON.stringify({
      model: req.model || DEFAULT_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: req.prompt },
      ],
    }),
  });

  const raw = await res.text();
  if (!res.ok) throw new Error(`OpenRouter returned ${res.status}: ${raw.slice(0, 300)}`);

  let payload: ChatResponse;
  try {
    payload = JSON.parse(raw) as ChatResponse;
  } catch {
    throw new Error(`OpenRouter sent back something unreadable: ${raw.slice(0, 300)}`);
  }
  if (payload.error) {
    throw new Error(payload.error.message || JSON.stringify(payload.error));
  }

  const content = payload.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error("The assistant replied with nothing.");

  const parsed = extractJson(content) as { actions?: unknown };
  if (!Array.isArray(parsed.actions)) {
    throw new Error(`The assistant did not suggest any changes: ${content.slice(0, 300)}`);
  }

  const usable = parsed.actions.filter((a) => usableAction(a, req.knownIds));
  if (!usable.length) {
    throw new Error("Nothing in the reply could be applied to this itinerary.");
  }

  return usable.map((action, i) => ({ ...action, aid: newActionId(i) }));
}

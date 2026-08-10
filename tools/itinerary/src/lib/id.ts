/* Ids only have to be unique inside one itinerary, and an agent may mint them
   too — llm.md says any short unique string works. */
function noise(length: number): string {
  return Math.random()
    .toString(36)
    .slice(2, 2 + length);
}

export function newEntryId(): string {
  return "e" + noise(6);
}

export function repairedEntryId(index: number): string {
  return "e" + index.toString(36) + noise(4);
}

export function newActionId(index: number): string {
  return "a" + index + noise(4);
}

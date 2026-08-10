/* Storage can be switched off, and a browser that refuses it should still show
   the itinerary. Only preferences and the library live here — nothing that
   cannot be rebuilt from the store. */

export function readText(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeText(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Nothing to do: the preference simply will not survive the tab.
  }
}

export function removeText(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // As above.
  }
}

export function readJson<T>(key: string): T | null {
  const raw = readText(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  writeText(key, JSON.stringify(value));
}

/* Phones can hand a link to another app; everything else copies it. The two
   need different feedback, so say which happened. */
export async function shareLink(url: string, title: string): Promise<"shared" | "copied"> {
  const text = `Look at my itinerary for ${title || "our trip"}\n\n${url}`;

  if (navigator.share && (!navigator.canShare || navigator.canShare({ text }))) {
    try {
      await navigator.share({ title: title || "Itinerary", text });
    } catch {
      // Dismissing the sheet is a choice, not a failure.
    }
    return "shared";
  }

  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard access can be refused; the link is still on screen.
    }
  }
  return "copied";
}

export async function copyText(text: string): Promise<void> {
  if (!navigator.clipboard) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // As above.
  }
}

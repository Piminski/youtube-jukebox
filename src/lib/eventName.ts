// Fallback when settings.event_title is empty (also used as the DB default).
export const EVENT_NAME =
  (import.meta.env.VITE_EVENT_NAME as string | undefined)?.trim() || "Jukebox";

export function eventTitle(title: string | undefined | null): string {
  const trimmed = title?.trim();
  return trimmed || EVENT_NAME;
}

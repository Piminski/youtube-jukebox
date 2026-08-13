// Event name shown on the display screen and in the admin footer.
export const EVENT_NAME =
  (import.meta.env.VITE_EVENT_NAME as string | undefined)?.trim() || "Jukebox";

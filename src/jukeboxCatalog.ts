/** Curated in-store jukebox selection (YouTube video IDs). */
export const JUKEBOX_CATALOG_IDS = [
  "TfUvZLxnEvI",
  "c1bLp8gqsNA",
  "dlY0H6PTIrc",
  "eNz1kAfaZMI",
  "KaBh3sdCqOE",
  "JkL6qonmpRE",
  "xf0CKLpEJM8",
  "CEqM8NkJyxE",
  "gQR8R29jXKA",
  "bXJTTq6EU9Y",
] as const;

export function jukeboxThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}

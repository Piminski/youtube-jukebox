import { getSupabase } from "./client";
import type { AddVideoInput, QueueItem, Settings, Visitor } from "./types";

const VISITOR_KEY = "jukebox.visitor";

function throwOnError(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(error.message);
}

export function loadLocalVisitor(): Visitor | null {
  try {
    const raw = localStorage.getItem(VISITOR_KEY);
    return raw ? (JSON.parse(raw) as Visitor) : null;
  } catch {
    return null;
  }
}

export function saveLocalVisitor(visitor: Visitor) {
  try {
    localStorage.setItem(VISITOR_KEY, JSON.stringify(visitor));
  } catch {
    /* ignore */
  }
}

export function clearLocalVisitor() {
  try {
    localStorage.removeItem(VISITOR_KEY);
  } catch {
    /* ignore */
  }
}

export async function registerVisitor(name: string, email: string): Promise<Visitor> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("visitors")
    .insert({ name: name.trim(), email: email.trim().toLowerCase() })
    .select("*")
    .single();
  throwOnError(error);
  const visitor = data as Visitor;
  saveLocalVisitor(visitor);
  return visitor;
}

function normalizeSettings(row: Settings): Settings {
  return { ...row, playlist_loop: row.playlist_loop !== false };
}

export async function fetchSettings(): Promise<Settings> {
  const sb = getSupabase();
  const { data, error } = await sb.from("settings").select("*").eq("id", 1).single();
  throwOnError(error);
  return normalizeSettings(data as Settings);
}

export async function updateSettings(
  patch: Partial<
    Pick<Settings, "event_title" | "max_duration_sec" | "paused" | "volume" | "playlist_loop">
  >,
): Promise<Settings> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("settings")
    .update(patch)
    .eq("id", 1)
    .select("*")
    .single();
  throwOnError(error);
  return normalizeSettings(data as Settings);
}

export async function fetchQueue(): Promise<QueueItem[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("queue_items")
    .select("*, visitor:visitors(*)")
    .in("status", ["queued", "playing", "hidden"])
    .order("position", { ascending: true });
  throwOnError(error);
  return (data ?? []) as QueueItem[];
}

export async function addVideo(input: AddVideoInput): Promise<QueueItem> {
  const sb = getSupabase();
  const { data: maxRow } = await sb
    .from("queue_items")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (maxRow?.position ?? 0) + 1;

  const payload = {
    youtube_id: input.youtube_id,
    title: input.title,
    channel: input.channel ?? null,
    thumbnail: input.thumbnail ?? null,
    duration_sec: input.duration_sec,
    visitor_id: input.visitor_id,
    source: "web",
    status: "queued",
    position,
  };

  const insert = (duration_sec: number) =>
    sb
      .from("queue_items")
      .insert({ ...payload, duration_sec })
      .select("*, visitor:visitors(*)")
      .single();

  let { data, error } = await insert(input.duration_sec);

  // Legacy DB trigger still rejects duration_sec above settings.max_duration_sec.
  // Retry with the cap so the add succeeds; playback already skips at that cap.
  const capMatch = error?.message.match(/exceeds maximum duration of (\d+) seconds/i);
  if (error && capMatch) {
    const capped = Math.max(1, Math.min(input.duration_sec, Number(capMatch[1])));
    ({ data, error } = await insert(capped));
  }

  throwOnError(error);
  return data as QueueItem;
}

export async function setItemStatus(
  id: string,
  status: QueueItem["status"],
  extra: Partial<Pick<QueueItem, "started_at" | "position">> = {},
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from("queue_items")
    .update({ status, ...extra })
    .eq("id", id);
  throwOnError(error);
}

export async function reorderQueue(orderedIds: string[]): Promise<void> {
  const sb = getSupabase();
  // Sequential updates keep RLS simple (no RPC required for MVP).
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await sb
      .from("queue_items")
      .update({ position: i + 1 })
      .eq("id", orderedIds[i]);
    throwOnError(error);
  }
}

/** Promote the next queued item; with loop, the current track goes to the end. */
export async function advanceQueue(
  currentId: string | null,
  options: { loop?: boolean } = {},
): Promise<void> {
  const sb = getSupabase();
  const loop = options.loop === true;

  const { data: next, error } = await sb
    .from("queue_items")
    .select("id")
    .eq("status", "queued")
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  throwOnError(error);

  if (currentId && loop) {
    if (next) {
      const { data: maxRow } = await sb
        .from("queue_items")
        .select("position")
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      await setItemStatus(currentId, "queued", {
        started_at: null,
        position: (maxRow?.position ?? 0) + 1,
      });
      await setItemStatus(next.id, "playing", {
        started_at: new Date().toISOString(),
      });
    } else {
      await setItemStatus(currentId, "playing", {
        started_at: new Date().toISOString(),
      });
    }
    return;
  }

  if (currentId) {
    await setItemStatus(currentId, "played", { started_at: null });
  }
  if (next) {
    await setItemStatus(next.id, "playing", { started_at: new Date().toISOString() });
  }
}

export async function playNow(id: string): Promise<void> {
  const sb = getSupabase();
  const { data: playing } = await sb
    .from("queue_items")
    .select("id")
    .eq("status", "playing");
  for (const row of playing ?? []) {
    await setItemStatus(row.id, "queued", { started_at: null });
  }
  // Move chosen item to front among active items.
  const items = await fetchQueue();
  const rest = items.filter((i) => i.id !== id).map((i) => i.id);
  await reorderQueue([id, ...rest]);
  await setItemStatus(id, "playing", { started_at: new Date().toISOString() });
}

export async function ensurePlaying(): Promise<void> {
  const items = await fetchQueue();
  const playing = items.find((i) => i.status === "playing");
  if (playing) return;
  const next = items.find((i) => i.status === "queued");
  if (next) {
    await setItemStatus(next.id, "playing", { started_at: new Date().toISOString() });
  }
}

export async function adminSignIn(email: string, password: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  throwOnError(error);
}

export async function adminSignOut(): Promise<void> {
  const sb = getSupabase();
  await sb.auth.signOut();
}

export async function getAdminSession() {
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  return data.session;
}

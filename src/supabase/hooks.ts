import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase, supabaseConfigured } from "./client";
import { fetchQueue, fetchSettings } from "./api";
import type { QueueItem, Settings } from "./types";

const DEFAULT_SETTINGS: Settings = {
  id: 1,
  max_duration_sec: 360,
  paused: false,
  volume: 0.85,
  updated_at: new Date().toISOString(),
};

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!supabaseConfigured()) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }
    try {
      const s = await fetchSettings();
      setSettings(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    if (!supabaseConfigured()) return;
    const sb = getSupabase();
    const channel = sb
      .channel("settings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "settings" },
        () => {
          void refresh();
        },
      )
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [refresh]);

  return { settings, setSettings, error, loading, refresh };
}

export function useQueue() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!supabaseConfigured()) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }
    try {
      const q = await fetchQueue();
      setItems(q);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    if (!supabaseConfigured()) return;
    const sb = getSupabase();
    const channel = sb
      .channel("queue")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "queue_items" },
        () => {
          void refresh();
        },
      )
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [refresh]);

  const playing = useMemo(
    () => items.find((i) => i.status === "playing") ?? null,
    [items],
  );
  const queued = useMemo(
    () => items.filter((i) => i.status === "queued"),
    [items],
  );
  const hidden = useMemo(
    () => items.filter((i) => i.status === "hidden"),
    [items],
  );
  const active = useMemo(
    () => items.filter((i) => i.status === "queued" || i.status === "playing"),
    [items],
  );

  return { items, playing, queued, hidden, active, error, loading, refresh, setItems };
}

/** Playable seconds for a queue item, capped by the admin max play duration. */
export function playableDuration(item: QueueItem, maxDurationSec: number): number {
  return Math.min(item.duration_sec, maxDurationSec);
}

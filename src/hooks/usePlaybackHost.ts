import { useEffect, useRef, useState } from "react";
import { advanceQueue, ensurePlaying } from "../supabase/api";
import { playableDuration } from "../supabase/hooks";
import type { QueueItem, Settings } from "../supabase/types";

/**
 * Runs only on the admin (playback host) device.
 * Ensures a playing track exists, tracks elapsed time, and advances the queue.
 */
export function usePlaybackHost(
  playing: QueueItem | null,
  settings: Settings,
  enabled: boolean,
  queuedCount = 0,
) {
  const [elapsed, setElapsed] = useState(0);
  const advancingRef = useRef(false);
  const elapsedRef = useRef(0);

  // Kick the first queued item into "playing" whenever the queue is idle.
  useEffect(() => {
    if (!enabled || playing || queuedCount <= 0) return;
    let cancelled = false;
    const kick = () => {
      if (cancelled) return;
      void ensurePlaying().catch(() => {
        /* retry on the next interval */
      });
    };
    kick();
    const id = window.setInterval(kick, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, playing, queuedCount]);

  useEffect(() => {
    advancingRef.current = false;
    if (!enabled || !playing) {
      elapsedRef.current = 0;
      setElapsed(0);
      return;
    }
    const base = playing.started_at
      ? Math.max(0, (Date.now() - new Date(playing.started_at).getTime()) / 1000)
      : 0;
    elapsedRef.current = base;
    setElapsed(base);
  }, [enabled, playing?.id, playing?.started_at]);

  useEffect(() => {
    if (!enabled || !playing || settings.paused) return;

    const itemId = playing.id;
    const limit = playableDuration(playing, settings.max_duration_sec);
    const loop = settings.playlist_loop;
    let last = Date.now();

    const tick = () => {
      const now = Date.now();
      elapsedRef.current += (now - last) / 1000;
      last = now;
      setElapsed(elapsedRef.current);
      if (elapsedRef.current >= limit && !advancingRef.current) {
        advancingRef.current = true;
        void advanceQueue(itemId, { loop }).catch(() => {
          advancingRef.current = false;
        });
      }
    };

    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [enabled, playing?.id, playing?.started_at, settings.paused, settings.max_duration_sec, settings.playlist_loop]);

  return { elapsed };
}

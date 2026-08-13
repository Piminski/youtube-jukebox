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
) {
  const [elapsed, setElapsed] = useState(0);
  const advancingRef = useRef(false);
  const playingIdRef = useRef<string | null>(null);
  const startedAtRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    void ensurePlaying().catch(() => {
      /* ignore */
    });
  }, [enabled, playing?.id]);

  useEffect(() => {
    if (!enabled || !playing) {
      setElapsed(0);
      playingIdRef.current = null;
      startedAtRef.current = null;
      advancingRef.current = false;
      return;
    }
    if (
      playingIdRef.current !== playing.id ||
      startedAtRef.current !== playing.started_at
    ) {
      playingIdRef.current = playing.id;
      startedAtRef.current = playing.started_at;
      advancingRef.current = false;
      if (playing.started_at) {
        const base = (Date.now() - new Date(playing.started_at).getTime()) / 1000;
        setElapsed(Math.max(0, base));
      } else {
        setElapsed(0);
      }
    }
  }, [enabled, playing]);

  useEffect(() => {
    if (!enabled || !playing || settings.paused) return;

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setElapsed((prev) => {
        const next = prev + dt;
        const limit = playableDuration(playing, settings.max_duration_sec);
        if (next >= limit && !advancingRef.current) {
          advancingRef.current = true;
          void advanceQueue(playing.id, { loop: settings.playlist_loop })
            .catch(() => {
              advancingRef.current = false;
            });
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, playing, settings.paused, settings.max_duration_sec, settings.playlist_loop]);

  return { elapsed };
}

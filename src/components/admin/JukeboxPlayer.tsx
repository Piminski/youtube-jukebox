import { useEffect, useRef } from "react";
import { loadYouTubeIframeApi } from "../../youtube";

interface JukeboxPlayerProps {
  videoId: string | null; // current jukebox track, or null for non-jukebox
  volume: number; // 0..1, mirrors the in-store master volume
  stage: boolean; // full-bleed video (visualizer) vs hidden audio-only
  paused?: boolean;
}

// The single in-store YouTube player. It lives above the admin tabs so the
// room's music keeps playing as staff navigate, and is shown full-bleed only
// when the Visualizer is projecting a jukebox track.
export default function JukeboxPlayer({ videoId, volume, stage, paused = false }: JukeboxPlayerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  // YT.Player instance (untyped — the IFrame API ships no bundled types).
  const playerRef = useRef<{
    setVolume: (v: number) => void;
    loadVideoById: (id: string) => void;
    playVideo: () => void;
    pauseVideo: () => void;
    stopVideo: () => void;
    destroy: () => void;
  } | null>(null);
  const readyRef = useRef(false);
  const pendingRef = useRef<string | null>(null);
  // Latest values for the gesture-unlock handler to read without re-binding.
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const videoIdRef = useRef<string | null>(videoId);
  videoIdRef.current = videoId;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    let cancelled = false;
    void loadYouTubeIframeApi().then(() => {
      if (cancelled || !hostRef.current) return;
      // YT replaces its target element with an iframe, so hand it a throwaway
      // node we create imperatively (never one React is tracking).
      const target = document.createElement("div");
      hostRef.current.appendChild(target);
      const YT = (window as unknown as { YT: { Player: new (el: Element, opts: unknown) => unknown } }).YT;
      playerRef.current = new YT.Player(target, {
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 1,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          iv_load_policy: 3,
        },
        events: {
          onReady: () => {
            readyRef.current = true;
            playerRef.current?.setVolume(Math.round(volume * 100));
            if (pendingRef.current) {
              playerRef.current?.loadVideoById(pendingRef.current);
              pendingRef.current = null;
            }
          },
        },
      }) as typeof playerRef.current;
    });
    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy();
      } catch {
        // Player may not have finished initialising.
      }
      playerRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load, switch, or stop the video as the current track changes.
  useEffect(() => {
    const p = playerRef.current;
    if (!videoId) {
      if (readyRef.current && p) {
        try {
          p.stopVideo();
        } catch {
          /* ignore */
        }
      }
      return;
    }
    if (!readyRef.current || !p) {
      pendingRef.current = videoId;
      return;
    }
    try {
      p.loadVideoById(videoId);
    } catch {
      /* ignore */
    }
  }, [videoId]);

  useEffect(() => {
    const p = playerRef.current;
    if (readyRef.current && p) {
      try {
        p.setVolume(Math.round(volume * 100));
      } catch {
        /* ignore */
      }
    }
  }, [volume]);

  useEffect(() => {
    const p = playerRef.current;
    if (!readyRef.current || !p || !videoId) return;
    try {
      if (paused) p.pauseVideo();
      else p.playVideo();
    } catch {
      /* ignore */
    }
  }, [paused, videoId]);

  // Browsers can block autoplay-with-sound until the user interacts. On the
  // first gesture, nudge the current jukebox track to play with sound. Guarded
  // by videoIdRef so we never restart a stopped (non-jukebox) track.
  useEffect(() => {
    const unlock = () => {
      const p = playerRef.current;
      if (readyRef.current && p && videoIdRef.current && !pausedRef.current) {
        try {
          p.setVolume(Math.round(volumeRef.current * 100));
          p.playVideo();
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  return (
    <div className={`jukebox-player${stage ? " stage" : " hidden"}`} aria-hidden={!stage}>
      <div ref={hostRef} className="jukebox-player-host" />
    </div>
  );
}

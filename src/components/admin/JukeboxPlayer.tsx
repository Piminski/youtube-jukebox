import { useEffect, useRef } from "react";
import { loadYouTubeIframeApi } from "../../youtube";

interface JukeboxPlayerProps {
  videoId: string | null; // current jukebox track, or null for idle
  volume: number; // 0..1, mirrors the in-store master volume
  stage: boolean; // full-bleed video vs hidden audio-only
  paused?: boolean;
  muted?: boolean; // admin preview: picture only; display unmutes after a gesture
  startSeconds?: number; // seek on load so a late display matches admin
  trackKey?: string; // reload when the queue item changes, even if youtube_id repeats
}

type YtPlayer = {
  setVolume: (v: number) => void;
  mute: () => void;
  unMute: () => void;
  loadVideoById: (opts: { videoId: string; startSeconds?: number } | string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  destroy: () => void;
};

function applyMute(player: YtPlayer, muted: boolean) {
  if (muted) player.mute();
  else player.unMute();
}

function loadTrack(player: YtPlayer, videoId: string, startSeconds: number) {
  player.loadVideoById({
    videoId,
    startSeconds: Number.isFinite(startSeconds) ? Math.max(0, startSeconds) : 0,
  });
}

// YouTube IFrame used by /display (room audio + picture) and admin (muted preview).
export default function JukeboxPlayer({
  videoId,
  volume,
  stage,
  paused = false,
  muted = false,
  startSeconds = 0,
  trackKey,
}: JukeboxPlayerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YtPlayer | null>(null);
  const readyRef = useRef(false);
  const pendingRef = useRef<string | null>(null);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const videoIdRef = useRef<string | null>(videoId);
  videoIdRef.current = videoId;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const startSecondsRef = useRef(startSeconds);
  startSecondsRef.current = startSeconds;

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
          // Always start muted so the picture can autoplay; sound unlocks on gesture.
          mute: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            readyRef.current = true;
            const p = playerRef.current;
            if (!p) return;
            try {
              p.mute();
              p.setVolume(Math.round(volumeRef.current * 100));
            } catch {
              /* ignore */
            }
            if (pendingRef.current) {
              loadTrack(p, pendingRef.current, startSecondsRef.current);
              pendingRef.current = null;
              if (!mutedRef.current) p.unMute();
              if (pausedRef.current) p.pauseVideo();
            }
          },
        },
      }) as YtPlayer;
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
      loadTrack(p, videoId, startSecondsRef.current);
      if (!mutedRef.current) p.unMute();
      if (pausedRef.current) p.pauseVideo();
    } catch {
      /* ignore */
    }
  }, [videoId, trackKey]);

  useEffect(() => {
    const p = playerRef.current;
    if (readyRef.current && p) {
      try {
        p.setVolume(Math.round(volume * 100));
        if (muted) p.mute();
      } catch {
        /* ignore */
      }
    }
  }, [volume, muted]);

  useEffect(() => {
    const p = playerRef.current;
    if (!readyRef.current || !p || !videoId) return;
    try {
      if (paused) p.pauseVideo();
      else p.playVideo();
    } catch {
      /* ignore */
    }
  }, [paused, videoId, trackKey]);

  // Browsers can block autoplay-with-sound until the user interacts. On the
  // first gesture, nudge the current jukebox track to play. Guarded by
  // videoIdRef so we never restart a stopped (idle) track.
  useEffect(() => {
    const unlock = () => {
      const p = playerRef.current;
      if (readyRef.current && p && videoIdRef.current && !pausedRef.current) {
        try {
          applyMute(p, mutedRef.current);
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

import { useEffect, useRef, useState } from "react";
import { loadYouTubeIframeApi } from "../youtube";

interface JukeboxPreviewProps {
  videoId: string;
  playing: boolean;
  title: string;
  channel: string;
  thumbnail: string;
  onPlayableChange?: (playable: boolean) => void;
  onPlaybackError?: (videoId: string, code: number) => void;
}

type YtPlayer = {
  cueVideoById: (id: string) => void;
  loadVideoById: (id: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  setVolume: (v: number) => void;
  destroy: () => void;
};

const YT_PLAYING = 1;
const YT_BUFFERING = 3;

function previewErrorMessage(code: number): string {
  if (code === 101 || code === 150) {
    return "This track can't be played here — try another search result.";
  }
  if (code === 100) {
    return "This track isn't available right now — try another result.";
  }
  return "Preview unavailable — try another result.";
}

// Hidden YouTube player for audio-only preview. Cues the track as soon as it is
// selected so Play can start with minimal delay.
export default function JukeboxPreview({
  videoId,
  playing,
  title,
  channel,
  thumbnail,
  onPlayableChange,
  onPlaybackError,
}: JukeboxPreviewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YtPlayer | null>(null);
  const readyRef = useRef(false);
  const pendingIdRef = useRef<string | null>(videoId);
  const playingRef = useRef(playing);
  const videoIdRef = useRef(videoId);
  playingRef.current = playing;
  videoIdRef.current = videoId;

  const [error, setError] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);

  const syncTrack = (id: string, shouldPlay: boolean) => {
    const p = playerRef.current;
    if (!p) return;
    try {
      if (shouldPlay) {
        p.loadVideoById(id);
        p.playVideo();
      } else {
        p.cueVideoById(id);
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    let cancelled = false;
    void loadYouTubeIframeApi().then(() => {
      if (cancelled || !hostRef.current) return;
      const target = document.createElement("div");
      hostRef.current.appendChild(target);
      const YT = (window as unknown as { YT: { Player: new (el: Element, opts: unknown) => unknown; PlayerState: { PLAYING: number; BUFFERING: number } } }).YT;
      playerRef.current = new YT.Player(target, {
        width: "1",
        height: "1",
        playerVars: {
          autoplay: 0,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          iv_load_policy: 3,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            readyRef.current = true;
            playerRef.current?.setVolume(85);
            const id = pendingIdRef.current ?? videoIdRef.current;
            if (id) {
              syncTrack(id, playingRef.current);
              pendingIdRef.current = null;
            }
          },
          onStateChange: (event: { data: number }) => {
            if (event.data === YT_BUFFERING && playingRef.current) {
              setStarting(true);
            }
            if (event.data === YT_PLAYING) {
              setStarting(false);
            }
          },
          onError: (event: { data: number }) => {
            setError(event.data);
            setStarting(false);
            onPlaybackError?.(videoIdRef.current, event.data);
          },
        },
      }) as YtPlayer;
    });
    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy();
      } catch {
        /* player may not have initialised */
      }
      playerRef.current = null;
      readyRef.current = false;
    };
  }, []);

  useEffect(() => {
    setError(null);
    onPlayableChange?.(true);
    const p = playerRef.current;
    if (!readyRef.current || !p) {
      pendingIdRef.current = videoId;
      return;
    }
    syncTrack(videoId, playingRef.current);
  }, [videoId, onPlayableChange]);

  useEffect(() => {
    if (error !== null) onPlayableChange?.(false);
    else if (!starting) onPlayableChange?.(true);
  }, [error, starting, onPlayableChange]);

  useEffect(() => {
    const p = playerRef.current;
    if (!readyRef.current || !p) return;
    try {
      if (playing) {
        setStarting(true);
        p.playVideo();
      } else {
        setStarting(false);
        p.pauseVideo();
      }
    } catch {
      /* ignore */
    }
  }, [playing]);

  const statusLabel = error
    ? "Preview unavailable"
    : playing
      ? starting
        ? "Starting…"
        : "Now playing"
      : "Ready to preview";

  return (
    <div className="jukebox-audio-preview">
      <div ref={hostRef} className="jukebox-audio-player-host" aria-hidden />
      <div className="jukebox-audio-preview-card">
        {thumbnail && (
          <span className={`jukebox-audio-art${playing && !error && !starting ? " playing" : ""}`}>
            <img src={thumbnail} alt="" />
          </span>
        )}
        <div className="jukebox-audio-meta">
          <span className="jukebox-audio-status">{statusLabel}</span>
          <span className="jukebox-audio-title">{title}</span>
          <span className="jukebox-audio-channel">{channel}</span>
          {error !== null && (
            <span className="jukebox-audio-error">{previewErrorMessage(error)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

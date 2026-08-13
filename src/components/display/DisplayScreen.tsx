import { useEffect, useRef, useState } from "react";
import JukeboxPlayer from "../admin/JukeboxPlayer";
import { useQueue, useSettings, playableDuration } from "../../supabase/hooks";
import { eventTitle } from "../../lib/eventName";

function elapsedSeconds(startedAt: string | null): number {
  if (!startedAt) return 0;
  return Math.max(0, (Date.now() - new Date(startedAt).getTime()) / 1000);
}

function fullscreenElement(): Element | null {
  const doc = document as Document & { webkitFullscreenElement?: Element | null };
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

async function requestFullscreen(el: HTMLElement) {
  const node = el as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  try {
    if (el.requestFullscreen) await el.requestFullscreen();
    else node.webkitRequestFullscreen?.();
  } catch {
    /* unsupported or dismissed */
  }
}

export default function DisplayScreen() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { settings } = useSettings();
  const { playing, loading } = useQueue();
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const limit = playing ? playableDuration(playing, settings.max_duration_sec) : 0;
  const startSeconds = playing
    ? Math.min(Math.max(0, limit - 0.5), elapsedSeconds(playing.started_at))
    : 0;

  useEffect(() => {
    const sync = () => setIsFullscreen(Boolean(fullscreenElement()));
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  const startShow = () => {
    setAudioUnlocked(true);
    if (rootRef.current && !fullscreenElement()) {
      void requestFullscreen(rootRef.current);
    }
  };

  return (
    <div
      ref={rootRef}
      className={`display-screen${isFullscreen ? " fullscreen" : ""}`}
    >
      <div className="display-top">
        <span className="display-event">{eventTitle(settings.event_title)}</span>
        {settings.paused && <span className="display-paused">Paused</span>}
      </div>

      <div className="display-stage">
        <JukeboxPlayer
          videoId={playing?.youtube_id ?? null}
          volume={settings.volume}
          stage={Boolean(playing)}
          paused={settings.paused}
          startSeconds={startSeconds}
          trackKey={playing?.id}
        />
        {!playing && (
          <span className="display-idle">
            {loading ? "Connecting…" : "Queue is open — add a track"}
          </span>
        )}
      </div>

      <div className="display-bottom">
        {playing ? (
          <>
            <span className="display-title">{playing.title}</span>
            <span className="display-by">
              Selected by: {playing.visitor?.name ?? "Guest"}
            </span>
          </>
        ) : (
          <span className="display-title" aria-hidden>
            &nbsp;
          </span>
        )}
      </div>

      {!audioUnlocked && (
        <button type="button" className="display-unlock" onClick={startShow}>
          Click to start fullscreen audio
        </button>
      )}
    </div>
  );
}

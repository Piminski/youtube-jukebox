import { useEffect, useRef, useState } from "react";
import JukeboxPlayer from "../admin/JukeboxPlayer";
import { useQueue, useSettings, playableDuration } from "../../supabase/hooks";
import { fmtTime } from "../../lib/format";

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

async function exitFullscreen() {
  const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> | void };
  try {
    if (document.exitFullscreen && document.fullscreenElement) await document.exitFullscreen();
    else doc.webkitExitFullscreen?.();
  } catch {
    /* ignore */
  }
}

export default function DisplayScreen() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { settings } = useSettings();
  const { playing, queued, loading } = useQueue();
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

  const toggleFullscreen = () => {
    if (fullscreenElement()) void exitFullscreen();
    else if (rootRef.current) void requestFullscreen(rootRef.current);
  };

  return (
    <div ref={rootRef} className={`display-screen${isFullscreen ? " fullscreen" : ""}`}>
      {playing?.thumbnail && (
        <div
          className="display-bg"
          style={{ backgroundImage: `url(${playing.thumbnail})` }}
          aria-hidden
        />
      )}

      <JukeboxPlayer
        videoId={playing?.youtube_id ?? null}
        volume={settings.volume}
        stage={Boolean(playing)}
        paused={settings.paused}
        startSeconds={startSeconds}
        trackKey={playing?.id}
      />

      <div className={`display-overlay${playing ? " playing" : ""}`}>
        <header className="display-brand">
          <span>YouTube Jukebox</span>
          <span className="display-brand-actions">
            {settings.paused && <em>Paused</em>}
            <button type="button" className="display-fs-btn" onClick={toggleFullscreen}>
              {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            </button>
          </span>
        </header>

        <section className="display-now">
          {playing ? (
            <>
              <p className="eyebrow">Now playing</p>
              <h1>{playing.title}</h1>
              <p className="display-meta">
                {playing.visitor?.name ?? "Guest"}
                {playing.channel ? ` · ${playing.channel}` : ""}
                {" · "}
                {fmtTime(limit)}
              </p>
            </>
          ) : (
            <>
              <p className="eyebrow">Live queue</p>
              <h1>{loading ? "Connecting…" : "Add a track to start the night"}</h1>
            </>
          )}
        </section>

        <section className="display-upnext">
          <h2>Up next</h2>
          {queued.length === 0 ? (
            <p className="empty">Queue is open</p>
          ) : (
            <ol>
              {queued.slice(0, 6).map((item) => (
                <li key={item.id}>
                  <span className="title">{item.title}</span>
                  <span className="who">{item.visitor?.name ?? "Guest"}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {!audioUnlocked && (
        <button type="button" className="display-unlock" onClick={startShow}>
          Click to start fullscreen audio
        </button>
      )}
    </div>
  );
}

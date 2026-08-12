import { useEffect, useState } from "react";
import JukeboxPlayer from "../admin/JukeboxPlayer";
import { useQueue, useSettings, playableDuration } from "../../supabase/hooks";
import { fmtTime } from "../../lib/format";

function elapsedSeconds(startedAt: string | null): number {
  if (!startedAt) return 0;
  return Math.max(0, (Date.now() - new Date(startedAt).getTime()) / 1000);
}

export default function DisplayScreen() {
  const { settings } = useSettings();
  const { playing, queued, loading } = useQueue();
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const limit = playing ? playableDuration(playing, settings.max_duration_sec) : 0;
  const startSeconds = playing
    ? Math.min(Math.max(0, limit - 0.5), elapsedSeconds(playing.started_at))
    : 0;

  useEffect(() => {
    const unlock = () => setAudioUnlocked(true);
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  return (
    <div className="display-screen">
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
          {settings.paused && <em>Paused</em>}
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
        <button type="button" className="display-unlock" onClick={() => setAudioUnlocked(true)}>
          Click to start audio
        </button>
      )}
    </div>
  );
}

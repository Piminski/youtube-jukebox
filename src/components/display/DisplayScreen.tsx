import { useQueue, useSettings, playableDuration } from "../../supabase/hooks";
import { fmtTime } from "../../lib/format";

export default function DisplayScreen() {
  const { settings } = useSettings();
  const { playing, queued, loading } = useQueue();

  return (
    <div className="display-screen">
      {playing?.thumbnail && (
        <div
          className="display-bg"
          style={{ backgroundImage: `url(${playing.thumbnail})` }}
          aria-hidden
        />
      )}

      <div className="display-overlay">
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
                {fmtTime(playableDuration(playing, settings.max_duration_sec))}
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
    </div>
  );
}

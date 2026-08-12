import { useEffect, useMemo, useState } from "react";
import {
  adminSignOut,
  advanceQueue,
  getAdminSession,
  playNow,
  reorderQueue,
  setItemStatus,
  updateSettings,
} from "../../supabase/api";
import { usePlaybackHost } from "../../hooks/usePlaybackHost";
import { fmtTime } from "../../lib/format";
import { navigate } from "../../lib/route";
import { playableDuration, useQueue, useSettings } from "../../supabase/hooks";
import AdminLogin from "./AdminLogin";
import JukeboxPlayer from "./JukeboxPlayer";

type Section = "queue" | "controls" | "settings";

export default function AdminApp() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [section, setSection] = useState<Section>("queue");
  const [busyId, setBusyId] = useState<string | null>(null);
  const { settings, setSettings, refresh: refreshSettings } = useSettings();
  const { items, playing, queued, hidden, loading, error, refresh } = useQueue();
  const { elapsed } = usePlaybackHost(playing, settings, Boolean(authed));

  useEffect(() => {
    void getAdminSession()
      .then((session) => setAuthed(Boolean(session)))
      .catch(() => setAuthed(false));
  }, []);

  const orderedActive = useMemo(() => {
    const list = [...queued];
    if (playing) return [playing, ...list];
    return list;
  }, [playing, queued]);

  if (authed === null) {
    return (
      <div className="shell admin-shell">
        <p className="muted">Checking session…</p>
      </div>
    );
  }

  if (!authed) {
    return <AdminLogin onSignedIn={() => setAuthed(true)} />;
  }

  const move = async (id: string, dir: -1 | 1) => {
    const ids = orderedActive.map((i) => i.id);
    const idx = ids.indexOf(id);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= ids.length) return;
    const next = [...ids];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setBusyId(id);
    try {
      await reorderQueue(next);
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const limit = playing
    ? playableDuration(playing, settings.max_duration_sec)
    : 0;

  return (
    <div className="admin-shell">
      <JukeboxPlayer
        videoId={playing?.youtube_id ?? null}
        volume={settings.volume}
        stage={section === "controls"}
        paused={settings.paused}
      />

      <aside className="admin-nav">
        <div className="admin-brand">
          <strong>Jukebox</strong>
          <span>Admin</span>
        </div>
        {(
          [
            ["queue", "Queue"],
            ["controls", "Playback"],
            ["settings", "Settings"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={section === id ? "active" : ""}
            onClick={() => setSection(id)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className="ghost"
          onClick={() => window.open("/display", "_blank")}
        >
          Open display
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            void adminSignOut().then(() => setAuthed(false));
          }}
        >
          Sign out
        </button>
        <button type="button" className="ghost" onClick={() => navigate("visitor")}>
          Visitor site
        </button>
      </aside>

      <main className="admin-main app-scroll">
        {error && <p className="form-error">{error}</p>}
        {loading && <p className="muted">Loading…</p>}

        {section === "queue" && (
          <section className="admin-panel">
            <header className="admin-panel-head">
              <h1>Queue</h1>
              <p className="muted">{items.length} active · hidden {hidden.length}</p>
            </header>

            <ul className="admin-track-list">
              {orderedActive.map((item, index) => (
                <li key={item.id} className={item.status === "playing" ? "playing" : ""}>
                  <img src={item.thumbnail ?? undefined} alt="" />
                  <div className="meta">
                    <strong>{item.title}</strong>
                    <span>
                      {item.visitor?.name ?? "Guest"} ·{" "}
                      {fmtTime(playableDuration(item, settings.max_duration_sec))}
                      {item.status === "playing" ? " · now" : ` · #${index + 1}`}
                    </span>
                  </div>
                  <div className="actions">
                    <button
                      type="button"
                      disabled={busyId === item.id || index === 0}
                      onClick={() => void move(item.id, -1)}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      disabled={busyId === item.id || index === orderedActive.length - 1}
                      onClick={() => void move(item.id, 1)}
                    >
                      Down
                    </button>
                    {item.status !== "playing" && (
                      <button
                        type="button"
                        onClick={() => {
                          setBusyId(item.id);
                          void playNow(item.id)
                            .then(() => refresh())
                            .finally(() => setBusyId(null));
                        }}
                      >
                        Play
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setBusyId(item.id);
                        const wasPlaying = item.status === "playing";
                        void setItemStatus(item.id, "hidden")
                          .then(() => (wasPlaying ? advanceQueue(null) : undefined))
                          .then(() => refresh())
                          .finally(() => setBusyId(null));
                      }}
                    >
                      Hide
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => {
                        setBusyId(item.id);
                        const wasPlaying = item.status === "playing";
                        void setItemStatus(item.id, "removed")
                          .then(() => (wasPlaying ? advanceQueue(null) : undefined))
                          .then(() => refresh())
                          .finally(() => setBusyId(null));
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {hidden.length > 0 && (
              <>
                <h2>Hidden</h2>
                <ul className="admin-track-list">
                  {hidden.map((item) => (
                    <li key={item.id}>
                      <img src={item.thumbnail ?? undefined} alt="" />
                      <div className="meta">
                        <strong>{item.title}</strong>
                        <span>Hidden</span>
                      </div>
                      <div className="actions">
                        <button
                          type="button"
                          onClick={() => {
                            void setItemStatus(item.id, "queued").then(() => refresh());
                          }}
                        >
                          Unhide
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => {
                            void setItemStatus(item.id, "removed").then(() => refresh());
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        {section === "controls" && (
          <section className="admin-panel">
            <header className="admin-panel-head">
              <h1>Playback</h1>
              <p className="muted">This device is the room audio host.</p>
            </header>

            <div className="now-card">
              {playing ? (
                <>
                  <img src={playing.thumbnail ?? undefined} alt="" />
                  <div>
                    <h2>{playing.title}</h2>
                    <p>
                      {fmtTime(elapsed)} / {fmtTime(limit)}
                      {settings.paused ? " · paused" : ""}
                    </p>
                  </div>
                </>
              ) : (
                <p className="empty">Nothing in the queue.</p>
              )}
            </div>

            <div className="control-row">
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  void updateSettings({ paused: !settings.paused }).then((s) => {
                    setSettings(s);
                  });
                }}
              >
                {settings.paused ? "Resume" : "Pause"}
              </button>
              <button
                type="button"
                className="btn"
                disabled={!playing}
                onClick={() => {
                  void advanceQueue(playing?.id ?? null).then(() => refresh());
                }}
              >
                Skip
              </button>
            </div>

            <label className="slider-label">
              Volume ({Math.round(settings.volume * 100)}%)
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={settings.volume}
                onChange={(e) => {
                  const volume = Number(e.target.value);
                  setSettings({ ...settings, volume });
                  void updateSettings({ volume });
                }}
              />
            </label>
          </section>
        )}

        {section === "settings" && (
          <section className="admin-panel">
            <header className="admin-panel-head">
              <h1>Settings</h1>
            </header>
            <label className="slider-label">
              Max video duration ({fmtTime(settings.max_duration_sec)})
              <input
                type="range"
                min={60}
                max={900}
                step={15}
                value={settings.max_duration_sec}
                onChange={(e) => {
                  const max_duration_sec = Number(e.target.value);
                  setSettings({ ...settings, max_duration_sec });
                }}
                onMouseUp={() => {
                  void updateSettings({
                    max_duration_sec: settings.max_duration_sec,
                  }).then((s) => {
                    setSettings(s);
                    void refreshSettings();
                  });
                }}
                onTouchEnd={() => {
                  void updateSettings({
                    max_duration_sec: settings.max_duration_sec,
                  }).then((s) => {
                    setSettings(s);
                    void refreshSettings();
                  });
                }}
              />
            </label>
            <p className="muted">
              Visitors cannot add videos longer than this. Playing tracks are also
              capped to this length.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}

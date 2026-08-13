import { useEffect, useMemo, useState } from "react";
import {
  adminSignOut,
  advanceQueue,
  ensurePlaying,
  getAdminSession,
  playNow,
  reorderQueue,
  setItemStatus,
  updateSettings,
} from "../../supabase/api";
import { usePlaybackHost } from "../../hooks/usePlaybackHost";
import { eventTitle } from "../../lib/eventName";
import { addedBy, fmtTime } from "../../lib/format";
import { navigate } from "../../lib/route";
import { playableDuration, useQueue, useSettings } from "../../supabase/hooks";
import AddPlaylist from "./AddPlaylist";
import AdminLogin from "./AdminLogin";
import JukeboxPlayer from "./JukeboxPlayer";

type Section = "queue" | "controls" | "settings";

const NAV: ReadonlyArray<readonly [Section, string, string]> = [
  ["queue", "Queue", "01"],
  ["controls", "Playback", "02"],
  ["settings", "Settings", "03"],
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export default function AdminApp() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [section, setSection] = useState<Section>("queue");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const { settings, setSettings, refresh: refreshSettings } = useSettings();
  const { items, playing, queued, hidden, loading, error, refresh } = useQueue();
  const { elapsed } = usePlaybackHost(
    playing,
    settings,
    Boolean(authed),
    queued.length,
  );

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
    return <div className="admin-loading">Checking session…</div>;
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
    <div className={`admin-screen${section === "controls" ? " playback" : ""}`}>
      <JukeboxPlayer
        videoId={playing?.youtube_id ?? null}
        volume={settings.volume}
        stage={section === "controls"}
        muted
        paused={settings.paused}
        startSeconds={
          playing?.started_at
            ? Math.max(0, (Date.now() - new Date(playing.started_at).getTime()) / 1000)
            : 0
        }
        trackKey={`${playing?.id ?? ""}:${playing?.started_at ?? ""}`}
      />

      <aside className="admin-side">
        <div className="admin-brand">
          <span className="brand-pixel">JUKEBOX</span>
          <span className="admin-brand-sub">Admin</span>
        </div>
        <nav className="admin-nav">
          {NAV.map(([id, label, no]) => (
            <button
              key={id}
              type="button"
              className={`admin-nav-item${section === id ? " active" : ""}`}
              onClick={() => setSection(id)}
            >
              <span className="no">{no}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="admin-side-links">
          <button
            type="button"
            className="linklike"
            onClick={() => window.open("/display", "_blank")}
          >
            Open display ↗
          </button>
          <button
            type="button"
            className="linklike"
            onClick={() => navigate("visitor")}
          >
            Visitor site ↗
          </button>
          <button
            type="button"
            className="linklike"
            onClick={() => {
              void adminSignOut().then(() => setAuthed(false));
            }}
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <div className="transport">
          <span
            className={`transport-dot${playing && !settings.paused ? " live" : ""}`}
          />
          <div className="transport-meta">
            {playing ? (
              <>
                <span className="transport-title">{playing.title}</span>
                <span className="transport-sub">
                  {addedBy(playing)} · {fmtTime(elapsed)} /{" "}
                  {fmtTime(limit)}
                </span>
              </>
            ) : (
              <span className="transport-sub">Nothing playing</span>
            )}
          </div>
          <div className="transport-buttons">
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                void updateSettings({ paused: !settings.paused }).then((s) => {
                  setSettings(s);
                });
              }}
            >
              {settings.paused ? "Resume ▶" : "Pause ▮▮"}
            </button>
            <button
              type="button"
              className="btn"
              disabled={!playing && queued.length === 0}
              onClick={() => {
                if (playing) {
                  void advanceQueue(playing.id, {
                    loop: settings.playlist_loop,
                  }).then(() => refresh());
                } else {
                  void ensurePlaying().then(() => refresh());
                }
              }}
            >
              {playing ? "Skip ≫" : "Start ▶"}
            </button>
            <button
              type="button"
              className={`btn${settings.playlist_loop ? " primary" : ""}`}
              aria-pressed={settings.playlist_loop}
              onClick={() => {
                void updateSettings({ playlist_loop: !settings.playlist_loop }).then((s) => {
                  setSettings(s);
                });
              }}
            >
              Loop {settings.playlist_loop ? "On" : "Off"}
            </button>
          </div>
          <div className="transport-readouts">
            <label className="transport-volume">
              <span className="mono-label">
                Vol {Math.round(settings.volume * 100)}
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={settings.volume}
                aria-label="Volume"
                onChange={(e) => {
                  const volume = Number(e.target.value);
                  setSettings({ ...settings, volume });
                  void updateSettings({ volume });
                }}
              />
            </label>
            <span className="mono-label max">
              Max {fmtTime(settings.max_duration_sec)}
            </span>
          </div>
        </div>

        <div className="admin-content app-scroll">
          {error && <p className="admin-status error">{error}</p>}
          {loading && <p className="admin-status">Loading…</p>}

          {section === "queue" && (
            <>
              <AddPlaylist
                existingIds={new Set(items.map((item) => item.youtube_id))}
                onAdded={() => void refresh()}
              />
              <div className="admin-table-head">
                <span>No</span>
                <span />
                <span>Title</span>
                <span>Added by</span>
                <span className="r">Plays</span>
                <span className="r">Len</span>
                <span className="r">Actions</span>
              </div>
              <ul className="admin-table">
                {orderedActive.map((item, index) => (
                  <li
                    key={item.id}
                    className={item.status === "playing" ? "playing" : ""}
                  >
                    <span className="cell-no">
                      {item.status === "playing" ? "▶" : pad2(index + 1)}
                    </span>
                    <span className="q-thumb">
                      {item.thumbnail && <img src={item.thumbnail} alt="" />}
                    </span>
                    <span className="cell-title">{item.title}</span>
                    <span className="cell-who">
                      {addedBy(item)}
                    </span>
                    <span className="cell-plays">{item.play_count ?? 0}</span>
                    <span className="cell-len">
                      {fmtTime(playableDuration(item, settings.max_duration_sec))}
                    </span>
                    <span className="cell-actions">
                      <button
                        type="button"
                        disabled={busyId === item.id || index === 0}
                        onClick={() => void move(item.id, -1)}
                        aria-label="Move up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={
                          busyId === item.id ||
                          index === orderedActive.length - 1
                        }
                        onClick={() => void move(item.id, 1)}
                        aria-label="Move down"
                      >
                        ↓
                      </button>
                      {item.status === "playing" ? (
                        <span className="now-tag">Now</span>
                      ) : (
                        <button
                          type="button"
                          className="play"
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
                        Del
                      </button>
                    </span>
                  </li>
                ))}
              </ul>

              {hidden.length > 0 && (
                <>
                  <div className="admin-subhead mono-label">Hidden</div>
                  <ul className="admin-table">
                    {hidden.map((item) => (
                      <li key={item.id}>
                        <span className="cell-no">—</span>
                        <span className="q-thumb">
                          {item.thumbnail && <img src={item.thumbnail} alt="" />}
                        </span>
                        <span className="cell-title">{item.title}</span>
                        <span className="cell-who">
                          {addedBy(item)}
                        </span>
                        <span className="cell-plays">{item.play_count ?? 0}</span>
                        <span className="cell-len">
                          {fmtTime(
                            playableDuration(item, settings.max_duration_sec),
                          )}
                        </span>
                        <span className="cell-actions">
                          <button
                            type="button"
                            onClick={() => {
                              void setItemStatus(item.id, "queued").then(() =>
                                refresh(),
                              );
                            }}
                          >
                            Unhide
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => {
                              void setItemStatus(item.id, "removed").then(() =>
                                refresh(),
                              );
                            }}
                          >
                            Del
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}

          {section === "controls" && (
            <section className="admin-panel">
              <p className="panel-note">
                Room audio and picture play on the display screen.
              </p>
            </section>
          )}

          {section === "settings" && (
            <section className="admin-panel">
              <label className="slider-label">
                Event title
                <input
                  type="text"
                  maxLength={80}
                  value={settings.event_title ?? ""}
                  onChange={(e) => {
                    setSettings({ ...settings, event_title: e.target.value });
                  }}
                  onBlur={() => {
                    const next = eventTitle(settings.event_title);
                    if (next !== settings.event_title) {
                      setSettings({ ...settings, event_title: next });
                    }
                    void updateSettings({ event_title: next }).then(
                      (s) => {
                        setTitleError(null);
                        setSettings(s);
                        void refreshSettings();
                      },
                      (e) => {
                        const msg =
                          e instanceof Error ? e.message : "Could not save event title";
                        setTitleError(
                          /event_title|schema cache|does not exist/i.test(msg)
                            ? "Database is missing event_title. In the Supabase SQL editor run: alter table public.settings add column if not exists event_title text not null default 'Jukebox';"
                            : msg,
                        );
                      },
                    );
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                />
              </label>
              {titleError && <p className="admin-status error">{titleError}</p>}
              <p className="panel-note">
                Shown in the top left of the display screen.
              </p>
              <label className="slider-label">
                Max play duration {fmtTime(settings.max_duration_sec)}
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
              <p className="panel-note">
                Any video can be added. Playback stops at this length, then the
                queue advances.
              </p>
              <label className="slider-label">
                Loop playlist
                <button
                  type="button"
                  className={`btn${settings.playlist_loop ? " primary" : ""}`}
                  aria-pressed={settings.playlist_loop}
                  onClick={() => {
                    void updateSettings({ playlist_loop: !settings.playlist_loop }).then((s) => {
                      setSettings(s);
                    });
                  }}
                >
                  {settings.playlist_loop ? "On" : "Off"}
                </button>
              </label>
              <p className="panel-note">
                When on, finished tracks requeue by play count and whose turn it
                is, so unplayed and first-request tracks stay ahead.
              </p>
            </section>
          )}
        </div>

        <div className="admin-foot">
          <span>
            Event: {eventTitle(settings.event_title)} · {items.length} active ·{" "}
            {hidden.length} hidden
          </span>
          <span>Supabase realtime · {error ? "Offline" : "Connected"}</span>
        </div>
      </main>
    </div>
  );
}

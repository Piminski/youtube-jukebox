import { useEffect, useState } from "react";
import { clearLocalVisitor } from "../../supabase/api";
import { addedBy, fmtTime } from "../../lib/format";
import { playableDuration } from "../../supabase/hooks";
import type { QueueItem, Settings, Visitor } from "../../supabase/types";

interface QueueViewProps {
  visitor: Visitor;
  playing: QueueItem | null;
  queued: QueueItem[];
  settings: Settings;
  loading: boolean;
  error: string | null;
  onAdd: () => void;
  onSignOut: () => void;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function elapsedSeconds(startedAt: string | null, now: number): number {
  if (!startedAt) return 0;
  return Math.max(0, (now - new Date(startedAt).getTime()) / 1000);
}

function fmtEndClock(waitSec: number): string {
  const end = new Date(Date.now() + waitSec * 1000);
  return `${end.getHours()}:${String(end.getMinutes()).padStart(2, "0")}`;
}

export default function QueueView({
  visitor,
  playing,
  queued,
  settings,
  loading,
  error,
  onAdd,
  onSignOut,
}: QueueViewProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!playing || settings.paused) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [playing, settings.paused]);

  const limit = playing ? playableDuration(playing, settings.max_duration_sec) : 0;
  const elapsed = playing
    ? Math.min(limit, elapsedSeconds(playing.started_at, now))
    : 0;
  const remainingSec =
    (playing ? Math.max(0, limit - elapsed) : 0) +
    queued.reduce(
      (sum, item) => sum + playableDuration(item, settings.max_duration_sec),
      0,
    );

  const statusLine = settings.paused
    ? "Playback paused — queue stays open"
    : playing || queued.length
      ? `${queued.length + (playing ? 1 : 0)} in queue — ends ${fmtEndClock(remainingSec)}`
      : "Queue is open — add a track";

  return (
    <div className="visitor-screen">
      <header className="topbar">
        <span className="brand-pixel">JUKEBOX</span>
        <button
          type="button"
          className="linklike"
          onClick={() => {
            clearLocalVisitor();
            onSignOut();
          }}
        >
          Sign out
        </button>
      </header>

      <div className="greeting">
        <h1>Hi, {visitor.name}.</h1>
        <p className="status-line">{loading ? "Loading queue…" : statusLine}</p>
        {error && <p className="form-error">{error}</p>}
      </div>

      <div className="queue-scroll app-scroll">
        <div className="section-head">
          <span className="mono-label">Now playing</span>
          {playing && (
            <span className="mono-label accent">
              {settings.paused ? "Paused" : "Live"}
            </span>
          )}
        </div>
        {playing ? (
          <div className="np">
            <div className="np-row">
              <span className="q-thumb">
                {playing.thumbnail && <img src={playing.thumbnail} alt="" />}
              </span>
              <div className="np-meta">
                <span className="np-title">{playing.title}</span>
                <span className="np-sub">
                  {addedBy(playing)} · {fmtTime(elapsed)} /{" "}
                  {fmtTime(limit)}
                </span>
              </div>
            </div>
            <div className="np-bar">
              <div
                style={{
                  width: `${limit > 0 ? Math.min(100, (elapsed / limit) * 100) : 0}%`,
                }}
              />
            </div>
          </div>
        ) : (
          <p className="empty">Nothing playing yet.</p>
        )}

        <div className="section-head">
          <span className="mono-label">Up next</span>
          <span className="mono-label">{pad2(queued.length)}</span>
        </div>
        {queued.length === 0 ? (
          <p className="empty">The queue is empty. Be the first.</p>
        ) : (
          <ul className="queue-list">
            {queued.map((item, index) => (
              <li key={item.id} className="q-row">
                <span className="q-no">{pad2(index + (playing ? 2 : 1))}</span>
                <span className="q-thumb">
                  {item.thumbnail && <img src={item.thumbnail} alt="" />}
                </span>
                <span className="q-title">{item.title}</span>
                <span className="q-who">{addedBy(item)}</span>
                <span className="q-len">
                  {fmtTime(playableDuration(item, settings.max_duration_sec))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="cta-bar">
        <button type="button" className="btn-block" onClick={onAdd}>
          Add a video
        </button>
      </div>
    </div>
  );
}

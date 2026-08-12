import { clearLocalVisitor } from "../../supabase/api";
import { fmtClock, fmtTime } from "../../lib/format";
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

function TrackRow({
  item,
  maxDurationSec,
  badge,
}: {
  item: QueueItem;
  maxDurationSec: number;
  badge?: string;
}) {
  return (
    <li className="track-row">
      <div className="track-thumb">
        {item.thumbnail ? (
          <img src={item.thumbnail} alt="" />
        ) : (
          <div className="track-thumb-fallback" />
        )}
      </div>
      <div className="track-meta">
        <div className="track-title">{item.title}</div>
        <div className="track-sub">
          {item.visitor?.name ?? "Guest"}
          {" · "}
          {fmtTime(playableDuration(item, maxDurationSec))}
          {badge ? ` · ${badge}` : ""}
        </div>
      </div>
    </li>
  );
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
  const waitSec =
    (playing ? playableDuration(playing, settings.max_duration_sec) : 0) +
    queued.reduce(
      (sum, item) => sum + playableDuration(item, settings.max_duration_sec),
      0,
    );

  return (
    <div className="shell visitor-shell">
      <header className="page-head">
        <div>
          <p className="eyebrow">YouTube Jukebox</p>
          <h1>Hi, {visitor.name}</h1>
          <p className="muted">
            {settings.paused
              ? "Playback is paused"
              : queued.length
                ? `About ${fmtClock(waitSec)} until the end of the queue`
                : "Queue is open — add a track"}
          </p>
        </div>
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            clearLocalVisitor();
            onSignOut();
          }}
        >
          Sign out
        </button>
      </header>

      {error && <p className="form-error">{error}</p>}
      {loading && <p className="muted">Loading queue…</p>}

      <section className="queue-section">
        <h2>Now playing</h2>
        {playing ? (
          <ul className="track-list">
            <TrackRow
              item={playing}
              maxDurationSec={settings.max_duration_sec}
              badge={settings.paused ? "Paused" : "Live"}
            />
          </ul>
        ) : (
          <p className="empty">Nothing playing yet.</p>
        )}
      </section>

      <section className="queue-section">
        <h2>Up next ({queued.length})</h2>
        {queued.length === 0 ? (
          <p className="empty">The queue is empty. Be the first.</p>
        ) : (
          <ul className="track-list">
            {queued.map((item) => (
              <TrackRow
                key={item.id}
                item={item}
                maxDurationSec={settings.max_duration_sec}
              />
            ))}
          </ul>
        )}
      </section>

      <div className="sticky-cta">
        <button type="button" className="btn primary wide" onClick={onAdd}>
          Add a YouTube video
        </button>
      </div>
    </div>
  );
}

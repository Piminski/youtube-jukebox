import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { fmtTime } from "../../lib/format";
import { addVideo } from "../../supabase/api";
import {
  searchYouTube,
  youtubeConfigured,
  YouTubeError,
  type YouTubeResult,
} from "../../youtube";
import {
  verifyYouTubePlayback,
  youtubeQueueBlockReason,
} from "../../youtubeEmbedProbe";
import JukeboxPreview from "../JukeboxPreview";
import type { Visitor } from "../../supabase/types";

interface AddVideoProps {
  visitor: Visitor;
  onAdded: () => void;
  onBack: () => void;
  active?: boolean;
}

export default function AddVideo({
  visitor,
  onAdded,
  onBack,
  active = true,
}: AddVideoProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<YouTubeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<YouTubeResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<string>>(() => new Set());
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = query.trim();
    abortRef.current?.abort();
    if (!q) {
      setResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    if (!youtubeConfigured()) {
      setSearchError("YouTube search isn’t configured (missing API key).");
      return;
    }
    const ac = new AbortController();
    abortRef.current = ac;
    setSearching(true);
    setSearchError(null);
    setResults([]);
    const handle = window.setTimeout(() => {
      void searchYouTube(
        q,
        ac.signal,
        (result) => {
          if (result.durationSec > 0) {
            setResults((prev) =>
              prev.some((r) => r.videoId === result.videoId)
                ? prev
                : [...prev, result],
            );
          }
        },
      )
        .catch((err) => {
          if (ac.signal.aborted) return;
          setSearchError(
            err instanceof YouTubeError || err instanceof Error
              ? err.message
              : "Search failed",
          );
        })
        .finally(() => {
          if (!ac.signal.aborted) setSearching(false);
        });
    }, 350);
    return () => {
      window.clearTimeout(handle);
      ac.abort();
    };
  }, [query]);

  useEffect(() => {
    if (!active) setPreviewing(false);
  }, [active]);

  const choose = (track: YouTubeResult) => {
    setSelected(track);
    setPreviewing(false);
    setError(null);
    setBlocked(false);
  };

  const blockSelected = (reason: string) => {
    setPreviewing(false);
    setBlocked(true);
    setError(reason);
  };

  const publish = async () => {
    if (!selected || blocked) return;
    setBusy(true);
    setError(null);
    try {
      const check = await verifyYouTubePlayback(selected.videoId);
      if (!check.playable) {
        blockSelected(youtubeQueueBlockReason(check.errorCode));
        return;
      }
      await addVideo({
        youtube_id: selected.videoId,
        title: selected.title,
        channel: selected.channel,
        thumbnail: selected.thumbnail,
        duration_sec: selected.durationSec || 180,
        visitor_id: visitor.id,
      });
      setAddedIds((prev) => new Set(prev).add(selected.videoId));
      setPreviewing(false);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add video");
    } finally {
      setBusy(false);
    }
  };

  const q = query.trim();

  return (
    <div className="visitor-screen">
      <header className="topbar">
        <span className="brand-pixel">JUKEBOX</span>
        <button type="button" className="linklike" onClick={onBack}>
          ← Queue
        </button>
      </header>

      <div className="greeting">
        <h1>Add a video.</h1>
        <p className="status-line">
          {addedIds.size
            ? "Added to queue — pick another or go back"
            : "Search YouTube or paste a link"}
        </p>
      </div>

      <div className="addvideo-body">
        <div className="jukebox-search">
        <Search className="jukebox-search-icon" size={18} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search YouTube or paste a link"
          aria-label="Search YouTube"
        />
        {query && (
          <button
            type="button"
            className="jukebox-search-clear"
            onClick={() => setQuery("")}
            aria-label="Clear search"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {searching && <p className="jukebox-search-status">Searching…</p>}
      {searchError && <p className="jukebox-error">{searchError}</p>}
      {!youtubeConfigured() && (
        <p className="jukebox-warn">
          Set <code>VITE_YOUTUBE_API_KEY</code> to enable search.
        </p>
      )}
      {q && !searching && !searchError && results.length === 0 && youtubeConfigured() && (
        <p className="jukebox-search-status">No playable results</p>
      )}

      <div className="jukebox-results app-scroll">
        {results.map((r) => (
          <button
            key={r.videoId}
            type="button"
            className={`jukebox-result${selected?.videoId === r.videoId ? " selected" : ""}${addedIds.has(r.videoId) ? " added" : ""}`}
            onClick={() => choose(r)}
          >
            <span className="jukebox-thumb">
              {r.thumbnail && <img src={r.thumbnail} alt="" loading="lazy" />}
              {r.durationSec > 0 && (
                <span className="jukebox-dur">{fmtTime(r.durationSec)}</span>
              )}
            </span>
            <span className="jukebox-result-info">
              <span className="jukebox-result-title">{r.title}</span>
              {(addedIds.has(r.videoId) || r.channel) && (
                <span className="jukebox-result-channel">
                  {addedIds.has(r.videoId) ? "Added to queue" : r.channel}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

        {selected && (
          <div className="selected-panel">
            <JukeboxPreview
              videoId={selected.videoId}
              playing={previewing}
              title={selected.title}
              channel={selected.channel}
              thumbnail={selected.thumbnail}
              onPlaybackError={(videoId, code) => {
                if (videoId === selected.videoId) {
                  blockSelected(youtubeQueueBlockReason(code));
                }
              }}
            />
            <div className="selected-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setPreviewing((p) => !p)}
              >
                {previewing ? "Stop preview" : "Preview"}
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={busy || blocked || addedIds.has(selected.videoId)}
                onClick={() => void publish()}
              >
                {busy
                  ? "Adding…"
                  : addedIds.has(selected.videoId)
                    ? "Added"
                    : "Add to queue"}
              </button>
            </div>
            {error && <p className="form-error">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

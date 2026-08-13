import { FormEvent, useRef, useState } from "react";
import { addVideos } from "../../supabase/api";
import {
  fetchYouTubePlaylist,
  youtubeConfigured,
  YouTubeError,
} from "../../youtube";

interface AddPlaylistProps {
  existingIds: ReadonlySet<string>;
  onAdded: () => void;
}

export default function AddPlaylist({ existingIds, onAdded }: AddPlaylistProps) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const input = url.trim();
    if (!input || busy) return;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { tracks, truncated } = await fetchYouTubePlaylist(input, ac.signal);
      const seen = new Set(existingIds);
      const fresh = tracks.filter((track) => {
        if (seen.has(track.videoId)) return false;
        seen.add(track.videoId);
        return true;
      });
      if (fresh.length === 0) {
        setError(
          tracks.length
            ? "Those tracks are already in the queue."
            : "No playable videos in that playlist.",
        );
        return;
      }

      await addVideos(
        fresh.map((track) => ({
          youtube_id: track.videoId,
          title: track.title,
          channel: track.channel,
          thumbnail: track.thumbnail,
          duration_sec: track.durationSec,
        })),
      );

      const skipped = tracks.length - fresh.length;
      const parts = [
        `Added ${fresh.length} track${fresh.length === 1 ? "" : "s"}`,
      ];
      if (skipped > 0) parts.push(`${skipped} already queued`);
      if (truncated) parts.push("stopped at 100");
      setMessage(parts.join(" · "));
      setUrl("");
      onAdded();
    } catch (err) {
      if (ac.signal.aborted) return;
      setError(
        err instanceof YouTubeError || err instanceof Error
          ? err.message
          : "Couldn't add that playlist",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="admin-playlist" onSubmit={(e) => void submit(e)}>
      <label className="slider-label" htmlFor="admin-playlist-url">
        Add playlist
      </label>
      <div className="admin-playlist-row">
        <input
          id="admin-playlist-url"
          type="text"
          inputMode="url"
          autoComplete="off"
          placeholder="Paste a YouTube playlist or Mix URL"
          value={url}
          disabled={busy}
          onChange={(e) => {
            setUrl(e.target.value);
            setError(null);
            setMessage(null);
          }}
        />
        <button
          type="submit"
          className="btn primary"
          disabled={busy || !url.trim() || !youtubeConfigured()}
        >
          {busy ? "Adding…" : "Add"}
        </button>
      </div>
      {!youtubeConfigured() && (
        <p className="panel-note">Set VITE_YOUTUBE_API_KEY to enable this.</p>
      )}
      {youtubeConfigured() && !message && !error && !busy && (
        <p className="panel-note">
          Public playlists and Mixes. Adds up to 100 playable tracks.
        </p>
      )}
      {message && <p className="admin-status">{message}</p>}
      {error && <p className="admin-status error">{error}</p>}
    </form>
  );
}

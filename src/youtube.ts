// YouTube integration for the Jukebox maker.
//
// Two pieces live here:
//   1. searchYouTube() — calls the YouTube Data API v3 to find tracks. The API
//      key is read from VITE_YOUTUBE_API_KEY (set in .env / Vercel env). Restrict
//      the key to your domain in the Google Cloud console; it is shipped to the
//      client. NOTE: search.list costs 100 quota units, default quota is 10,000
//      units/day (~100 searches). Request a bump from Google for a busy event.
//   2. loadYouTubeIframeApi() — lazily injects the IFrame Player API used by the
//      in-store player to actually play the chosen videos.

import { filterEmbeddableVideoIds } from "./youtubeEmbedProbe";

export interface YouTubeResult {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  durationSec: number;
}

const API_KEY: string | undefined = (import.meta as unknown as {
  env: Record<string, string | undefined>;
}).env.VITE_YOUTUBE_API_KEY;

export function youtubeConfigured(): boolean {
  return !!API_KEY;
}

export class YouTubeError extends Error {}

function youtubeV3Url(path: string, params: Record<string, string>): URL {
  const base = import.meta.env.DEV
    ? "/api/youtube"
    : "https://www.googleapis.com/youtube/v3";
  const url = new URL(`${base}/${path}`, window.location.origin);
  url.search = new URLSearchParams({ ...params, key: API_KEY! }).toString();
  return url;
}

function extractYoutubeVideoId(input: string): string | null {
  const q = input.trim();
  const m =
    /(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/.exec(
      q,
    );
  return m?.[1] ?? null;
}

const PRIVATE_LISTS = new Set(["WL", "LL"]);

/** Watch, playlist, Mix, or raw playlist id. */
export function parseYoutubePlaylistInput(input: string): {
  videoId: string | null;
  playlistId: string | null;
} {
  const q = input.trim();
  if (!q) return { videoId: null, playlistId: null };

  const videoId = extractYoutubeVideoId(q);

  if (/^(PL|UU|FL|OL|RD|TL)[\w-]{6,}$/i.test(q)) {
    return { videoId, playlistId: q };
  }

  const fromQuery = (raw: string): string | null => {
    const m = /(?:[?&]list=)([\w-]+)/.exec(raw);
    const id = m?.[1] ?? null;
    return id && !PRIVATE_LISTS.has(id) ? id : null;
  };

  try {
    const withProto = /^https?:\/\//i.test(q) ? q : `https://${q}`;
    const url = new URL(withProto);
    const list = url.searchParams.get("list");
    if (list && !PRIVATE_LISTS.has(list)) {
      return { videoId, playlistId: list };
    }
  } catch {
    /* not a URL */
  }

  return { videoId, playlistId: fromQuery(q) };
}

async function throwYouTubeHttpError(
  res: Response,
  fallback: string,
): Promise<never> {
  let reason = "";
  let message = "";
  try {
    const body = (await res.json()) as {
      error?: {
        message?: string;
        errors?: { reason?: string }[];
        details?: { reason?: string }[];
      };
    };
    reason =
      body.error?.errors?.[0]?.reason ?? body.error?.details?.[0]?.reason ?? "";
    message = body.error?.message ?? "";
  } catch {
    /* ignore non-JSON bodies */
  }

  if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
    throw new YouTubeError("YouTube search quota reached. Try again later.");
  }
  if (
    reason === "API_KEY_HTTP_REFERRER_BLOCKED" ||
    /referer/i.test(message)
  ) {
    throw new YouTubeError(
      "This page origin isn’t allowed on the YouTube API key. Add it as an HTTP referrer in Google Cloud Console.",
    );
  }
  if (reason === "accessNotConfigured") {
    throw new YouTubeError("YouTube Data API is not enabled for this API key.");
  }
  throw new YouTubeError(message || fallback);
}

// Parse an ISO-8601 duration (e.g. "PT3M52S") into seconds.
function parseIsoDuration(iso: string): number {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso);
  if (!m) return 0;
  const [, h, min, s] = m;
  return Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Number(s ?? 0);
}

// Pull the best available thumbnail from a snippet's thumbnails object.
function pickThumb(thumbs: Record<string, { url: string }> | undefined): string {
  if (!thumbs) return "";
  return (
    thumbs.medium?.url ?? thumbs.high?.url ?? thumbs.default?.url ?? ""
  );
}

function passesApiEmbedCheck(status: {
  embeddable?: boolean;
  privacyStatus?: string;
  uploadStatus?: string;
} | undefined): boolean {
  if (!status) return false;
  const uploadOk =
    status.uploadStatus == null ||
    status.uploadStatus === "processed" ||
    status.uploadStatus === "uploaded";
  return (
    status.embeddable === true &&
    status.privacyStatus === "public" &&
    uploadOk
  );
}

// Search YouTube, apply API embed checks, then probe candidates — calling onResult
// for each verified track as soon as it passes (no need to wait for the full batch).
export async function searchYouTube(
  query: string,
  signal?: AbortSignal,
  onResult?: (result: YouTubeResult) => void,
): Promise<number> {
  const q = query.trim();
  if (!q) return 0;
  if (!API_KEY) {
    throw new YouTubeError(
      "YouTube search isn't configured. Add VITE_YOUTUBE_API_KEY to enable it.",
    );
  }

  const pastedId = extractYoutubeVideoId(q);
  if (pastedId) {
    return fetchPastedYouTubeVideo(pastedId, signal, onResult);
  }

  const searchUrl = youtubeV3Url("search", {
    part: "snippet",
    type: "video",
    videoEmbeddable: "true",
    videoSyndicated: "true",
    maxResults: "40",
    q,
  });

  const res = await fetch(searchUrl, { signal });
  if (!res.ok) {
    await throwYouTubeHttpError(
      res,
      "YouTube search failed. Check the connection and try again.",
    );
  }
  const data = (await res.json()) as {
    items?: {
      id: { videoId: string };
      snippet: {
        title: string;
        channelTitle: string;
        thumbnails: Record<string, { url: string }>;
      };
    }[];
  };
  const items = data.items ?? [];
  const ids = items.map((it) => it.id.videoId).filter(Boolean);
  if (ids.length === 0) return 0;

  const detailUrl = youtubeV3Url("videos", {
    part: "contentDetails,status,player",
    id: ids.join(","),
  });
  const detailRes = await fetch(detailUrl, { signal });
  if (!detailRes.ok) return 0;

  const detail = (await detailRes.json()) as {
    items?: {
      id: string;
      contentDetails: { duration: string };
      player?: { embedHtml?: string };
      status?: {
        embeddable?: boolean;
        privacyStatus?: string;
        uploadStatus?: string;
      };
    }[];
  };

  const playable = new Map<string, { durationSec: number }>();
  for (const it of detail.items ?? []) {
    const durationSec = parseIsoDuration(it.contentDetails.duration);
    const hasEmbedHtml = !!it.player?.embedHtml?.trim();
    if (
      !hasEmbedHtml ||
      !passesApiEmbedCheck(it.status) ||
      durationSec <= 0
    ) {
      continue;
    }
    playable.set(it.id, { durationSec });
  }

  const apiCandidates = items
    .filter((it) => playable.has(it.id.videoId))
    .map((it) => it.id.videoId);

  if (apiCandidates.length === 0) return 0;

  const byId = new Map(items.map((it) => [it.id.videoId, it]));

  return filterEmbeddableVideoIds(apiCandidates, signal, (videoId) => {
    const it = byId.get(videoId);
    if (!it) return;
    onResult?.({
      videoId,
      title: decodeHtml(it.snippet.title),
      channel: decodeHtml(it.snippet.channelTitle),
      thumbnail: pickThumb(it.snippet.thumbnails),
      durationSec: playable.get(videoId)!.durationSec,
    });
  }, 12);
}

const YOUTUBE_VIDEOS_PAGE_SIZE = 20;

type VideoDetailItem = {
  id: string;
  snippet: {
    title: string;
    channelTitle: string;
    thumbnails: Record<string, { url: string }>;
  };
  contentDetails: { duration: string };
  player?: { embedHtml?: string };
  status?: {
    embeddable?: boolean;
    privacyStatus?: string;
    uploadStatus?: string;
  };
};

function chunkIds(ids: string[], size: number): string[][] {
  const pages: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    pages.push(ids.slice(i, i + size));
  }
  return pages;
}

async function fetchVideoDetailsPage(
  ids: string[],
  signal?: AbortSignal,
): Promise<Map<string, VideoDetailItem>> {
  const detailUrl = youtubeV3Url("videos", {
    part: "snippet,contentDetails,status,player",
    id: ids.join(","),
  });
  const detailRes = await fetch(detailUrl, { signal });
  if (!detailRes.ok) {
    await throwYouTubeHttpError(
      detailRes,
      "Couldn't load tracks. Check the connection and try again.",
    );
  }

  const detail = (await detailRes.json()) as { items?: VideoDetailItem[] };
  return new Map((detail.items ?? []).map((it) => [it.id, it]));
}

function buildPlayableTrack(id: string, it: VideoDetailItem): YouTubeResult | null {
  const durationSec = parseIsoDuration(it.contentDetails.duration);
  const hasEmbedHtml = !!it.player?.embedHtml?.trim();
  if (!hasEmbedHtml || !passesApiEmbedCheck(it.status) || durationSec <= 0) {
    return null;
  }
  return {
    videoId: id,
    title: decodeHtml(it.snippet.title),
    channel: decodeHtml(it.snippet.channelTitle),
    thumbnail: pickThumb(it.snippet.thumbnails) || jukeboxThumb(id),
    durationSec,
  };
}

/** Curated jukebox entries — trust API metadata; preview handles playback failures. */
function buildCatalogTrack(id: string, it: VideoDetailItem): YouTubeResult | null {
  if (it.status?.privacyStatus === "private") return null;
  if (it.status?.embeddable === false) return null;
  const durationSec = parseIsoDuration(it.contentDetails.duration);
  return {
    videoId: id,
    title: decodeHtml(it.snippet.title),
    channel: decodeHtml(it.snippet.channelTitle),
    thumbnail: pickThumb(it.snippet.thumbnails) || jukeboxThumb(id),
    durationSec: Math.max(0, durationSec),
  };
}

export type FetchYouTubeVideosOptions = {
  /** Hand-picked jukebox list: skip slow client embed probes. */
  catalog?: boolean;
};

async function fetchPastedYouTubeVideo(
  videoId: string,
  signal?: AbortSignal,
  onResult?: (result: YouTubeResult) => void,
): Promise<number> {
  const byId = await fetchVideoDetailsPage([videoId], signal);
  const it = byId.get(videoId);
  if (!it) {
    throw new YouTubeError("This video isn't available.");
  }

  const track = buildPlayableTrack(videoId, it);
  if (!track) {
    throw new YouTubeError(
      it.status?.embeddable === false
        ? "This video can't be added — playback on other websites has been disabled by the owner."
        : "This video can't be played here, so it can't be added to the queue.",
    );
  }

  const verified = await filterEmbeddableVideoIds([videoId], signal, () => {
    onResult?.(track);
  });
  if (verified === 0 && !signal?.aborted) {
    throw new YouTubeError(
      "This video can't be played here, so it can't be added to the queue.",
    );
  }
  return verified;
}

// Load known video IDs (jukebox catalog) — cheaper than search.list (1 unit per page).
export async function fetchYouTubeVideos(
  videoIds: string[],
  signal?: AbortSignal,
  onResult?: (result: YouTubeResult) => void,
  options?: FetchYouTubeVideosOptions,
): Promise<number> {
  const catalog = options?.catalog ?? false;
  const ids = [...new Set(videoIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return 0;
  if (!API_KEY) {
    throw new YouTubeError(
      "YouTube isn't configured. Add VITE_YOUTUBE_API_KEY to enable it.",
    );
  }

  let verified = 0;

  for (const pageIds of chunkIds(ids, YOUTUBE_VIDEOS_PAGE_SIZE)) {
    if (signal?.aborted) break;

    const byId = await fetchVideoDetailsPage(pageIds, signal);
    const playable = new Map<string, YouTubeResult>();

    for (const id of pageIds) {
      const it = byId.get(id);
      if (!it) continue;
      const track = catalog ? buildCatalogTrack(id, it) : buildPlayableTrack(id, it);
      if (track) playable.set(id, track);
    }

    if (catalog) {
      for (const id of pageIds) {
        const track = playable.get(id);
        if (!track) continue;
        onResult?.(track);
        verified++;
      }
      continue;
    }

    const candidates = pageIds.filter((id) => playable.has(id));
    if (candidates.length === 0) continue;

    verified += await filterEmbeddableVideoIds(candidates, signal, (videoId) => {
      const track = playable.get(videoId);
      if (track) onResult?.(track);
    });
  }

  return verified;
}

const MAX_PLAYLIST_ITEMS = 100;

export type YouTubePlaylistFetch = {
  tracks: YouTubeResult[];
  truncated: boolean;
};

function uniqueVideoIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

async function fetchPlaylistItemIds(
  playlistId: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken = "";

  do {
    const params: Record<string, string> = {
      part: "contentDetails,status",
      playlistId,
      maxResults: "50",
    };
    if (pageToken) params.pageToken = pageToken;

    const res = await fetch(youtubeV3Url("playlistItems", params), { signal });
    if (!res.ok) {
      if (res.status === 404 || res.status === 403) return [];
      await throwYouTubeHttpError(res, "Couldn't load that playlist.");
    }

    const data = (await res.json()) as {
      nextPageToken?: string;
      items?: {
        contentDetails?: { videoId?: string };
        status?: { privacyStatus?: string };
      }[];
    };

    for (const it of data.items ?? []) {
      const id = it.contentDetails?.videoId;
      if (!id || it.status?.privacyStatus === "private") continue;
      ids.push(id);
      if (ids.length >= MAX_PLAYLIST_ITEMS) break;
    }

    pageToken =
      ids.length >= MAX_PLAYLIST_ITEMS ? "" : (data.nextPageToken ?? "");
  } while (pageToken);

  return uniqueVideoIds(ids);
}

type PlaylistPlayer = {
  cuePlaylist: (opts: { list: string; listType: string; index?: number }) => void;
  loadPlaylist: (opts: { list: string; listType: string; index?: number }) => void;
  getPlaylist: () => string[] | undefined;
  mute: () => void;
  pauseVideo: () => void;
  destroy: () => void;
};

// Mix / temporary lists (RD, TLGG, …) often return empty from playlistItems.
// The IFrame player can still expand them via getPlaylist().
function fetchPlaylistIdsFromPlayer(
  playlistId: string,
  videoId: string | null,
  signal?: AbortSignal,
): Promise<string[]> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    host.className = "yt-embed-probe-host";
    host.setAttribute("aria-hidden", "true");
    document.body.appendChild(host);
    const target = document.createElement("div");
    host.appendChild(target);

    let settled = false;
    let player: PlaylistPlayer | null = null;
    let pollId = 0;
    let boostId = 0;
    let timeoutId = 0;
    let lastLen = 0;
    let stableSince = Date.now();
    let boosted = false;

    const finish = (ids: string[]) => {
      if (settled) return;
      settled = true;
      window.clearInterval(pollId);
      window.clearTimeout(boostId);
      window.clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
      try {
        player?.destroy();
      } catch {
        /* ignore */
      }
      host.remove();
      resolve(uniqueVideoIds(ids).slice(0, MAX_PLAYLIST_ITEMS));
    };

    const onAbort = () => finish([]);
    signal?.addEventListener("abort", onAbort, { once: true });

    const currentIds = (): string[] => {
      try {
        return player?.getPlaylist() ?? [];
      } catch {
        return [];
      }
    };

    const take = () => {
      const ids = currentIds();
      if (ids.length !== lastLen) {
        lastLen = ids.length;
        stableSince = Date.now();
      }
      if (ids.length > 0 && Date.now() - stableSince >= 1800) {
        finish(ids);
      }
    };

    const YT = (
      window as unknown as {
        YT: { Player: new (el: Element, opts: unknown) => PlaylistPlayer };
      }
    ).YT;

    try {
      player = new YT.Player(target, {
        width: "1",
        height: "1",
        ...(videoId ? { videoId } : {}),
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          mute: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          iv_load_policy: 3,
          enablejsapi: 1,
          origin: window.location.origin,
          list: playlistId,
          listType: "playlist",
        },
        events: {
          onReady: () => {
            try {
              player?.mute();
              player?.cuePlaylist({
                list: playlistId,
                listType: "playlist",
                index: 0,
              });
            } catch {
              /* playerVars may already have the list */
            }
            take();
            pollId = window.setInterval(take, 250);
            boostId = window.setTimeout(() => {
              if (settled || boosted || lastLen > 0) return;
              boosted = true;
              try {
                player?.mute();
                player?.loadPlaylist({
                  list: playlistId,
                  listType: "playlist",
                  index: 0,
                });
                player?.mute();
                player?.pauseVideo();
              } catch {
                /* ignore */
              }
            }, 2500);
          },
          onStateChange: () => {
            try {
              player?.mute();
              player?.pauseVideo();
            } catch {
              /* ignore */
            }
            take();
          },
        },
      });
    } catch {
      finish([]);
      return;
    }

    timeoutId = window.setTimeout(() => finish(currentIds()), 10000);
  });
}

export async function fetchYouTubePlaylist(
  input: string,
  signal?: AbortSignal,
): Promise<YouTubePlaylistFetch> {
  const { videoId, playlistId } = parseYoutubePlaylistInput(input);
  if (!playlistId) {
    throw new YouTubeError(
      "Paste a YouTube playlist URL (it should include list=…).",
    );
  }
  if (!API_KEY) {
    throw new YouTubeError(
      "YouTube isn't configured. Add VITE_YOUTUBE_API_KEY to enable it.",
    );
  }

  let ids = await fetchPlaylistItemIds(playlistId, signal);
  if (ids.length === 0) {
    await loadYouTubeIframeApi();
    if (signal?.aborted) return { tracks: [], truncated: false };
    ids = await fetchPlaylistIdsFromPlayer(playlistId, videoId, signal);
  }

  const truncated = ids.length >= MAX_PLAYLIST_ITEMS;
  ids = ids.slice(0, MAX_PLAYLIST_ITEMS);
  if (ids.length === 0) {
    throw new YouTubeError(
      "Couldn't load that playlist. Private lists and some Mixes can't be read — try a public playlist URL.",
    );
  }

  const byId = new Map<string, YouTubeResult>();
  await fetchYouTubeVideos(
    ids,
    signal,
    (track) => {
      if (track.durationSec > 0) byId.set(track.videoId, track);
    },
    { catalog: true },
  );

  const tracks = ids
    .map((id) => byId.get(id))
    .filter((t): t is YouTubeResult => Boolean(t));

  if (tracks.length === 0) {
    throw new YouTubeError("No playable videos in that playlist.");
  }

  return { tracks, truncated };
}

function jukeboxThumb(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}

// API titles arrive HTML-escaped (e.g. &amp;, &#39;).
function decodeHtml(s: string): string {
  const el = document.createElement("textarea");
  el.innerHTML = s;
  return el.value;
}

// --- IFrame Player API ---

let apiPromise: Promise<void> | null = null;

// Inject and resolve once the global YT object is ready.
export function loadYouTubeIframeApi(): Promise<void> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<void>((resolve) => {
    const w = window as unknown as {
      YT?: { Player: unknown };
      onYouTubeIframeAPIReady?: () => void;
    };
    if (w.YT && w.YT.Player) {
      resolve();
      return;
    }
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
  });
  return apiPromise;
}

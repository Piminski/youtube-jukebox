import { loadYouTubeIframeApi } from "./youtube";

const YT_CUED = 5;
const YT_PLAYING = 1;
const EMBED_PROBE_MS = 2500;
const EMBED_SETTLE_MS = 350;
const PLAY_PROBE_MS = 8000;
const PLAY_SETTLE_MS = 500;
const PROBE_WORKERS = 3;
const PLAY_FILTER_WORKERS = 4;

type YtPlayer = {
  cueVideoById: (id: string) => void;
  loadVideoById: (id: string) => void;
  playVideo: () => void;
  mute: () => void;
  destroy: () => void;
};

export type YouTubePlaybackCheck = {
  playable: boolean;
  errorCode?: number;
};

export function youtubeQueueBlockReason(errorCode?: number): string {
  if (errorCode === 101 || errorCode === 150) {
    return "This video can't be added — playback on other websites has been disabled by the owner.";
  }
  if (errorCode === 100) {
    return "This video isn't available, so it can't be added to the queue.";
  }
  return "This video can't be played here, so it can't be added to the queue.";
}

let verifyLock: Promise<void> = Promise.resolve();

function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = verifyLock.then(fn, fn);
  verifyLock = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function probePlayer(
  signal: AbortSignal | undefined,
  opts: {
    timeoutMs: number;
    settleMs: number;
    mute?: boolean;
    onReady: (player: YtPlayer, finish: (ok: boolean) => void) => void;
    onState: (state: number, armSettle: () => void) => void;
  },
): Promise<YouTubePlaybackCheck> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    host.className = "yt-embed-probe-host";
    document.body.appendChild(host);
    const target = document.createElement("div");
    host.appendChild(target);

    let settled = false;
    let timeoutId = 0;
    let settleId = 0;
    let player: YtPlayer | null = null;

    const finish = (ok: boolean, errorCode?: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      clearTimeout(settleId);
      signal?.removeEventListener("abort", onAbort);
      try {
        player?.destroy();
      } catch {
        /* ignore */
      }
      host.remove();
      resolve({ playable: ok, errorCode });
    };

    const armSettle = () => {
      clearTimeout(settleId);
      settleId = window.setTimeout(() => finish(true), opts.settleMs);
    };

    const onAbort = () => finish(false);
    signal?.addEventListener("abort", onAbort, { once: true });
    timeoutId = window.setTimeout(() => finish(false), opts.timeoutMs);

    const YT = (window as unknown as {
      YT: { Player: new (el: Element, opts: unknown) => YtPlayer };
    }).YT;

    player = new YT.Player(target, {
      width: "1",
      height: "1",
      playerVars: {
        autoplay: 0,
        controls: 0,
        enablejsapi: 1,
        origin: window.location.origin,
        playsinline: 1,
        modestbranding: 1,
        rel: 0,
        iv_load_policy: 3,
        mute: opts.mute ? 1 : 0,
      },
      events: {
        onReady: () => {
          try {
            if (opts.mute) player?.mute();
            opts.onReady(player!, finish);
          } catch {
            finish(false);
          }
        },
        onStateChange: (event: { data: number }) => {
          opts.onState(event.data, armSettle);
        },
        onError: (event: { data: number }) => finish(false, event.data),
      },
    });
  });
}

// Search filter: cue the embed (no autoplay) — works without a fresh user gesture.
async function verifyEmbeddableOnce(
  videoId: string,
  signal?: AbortSignal,
): Promise<YouTubePlaybackCheck> {
  await loadYouTubeIframeApi();
  if (signal?.aborted) return { playable: false };

  return probePlayer(signal, {
    timeoutMs: EMBED_PROBE_MS,
    settleMs: EMBED_SETTLE_MS,
    onReady: (player) => player.cueVideoById(videoId),
    onState: (state, armSettle) => {
      if (state === YT_CUED) armSettle();
    },
  });
}

// Stricter check when adding to the queue (user gesture present). Cue can
// succeed for videos that then fail on play with "playback on other websites
// has been disabled" (IFrame errors 101 / 150).
async function verifyPlaybackOnce(
  videoId: string,
  signal?: AbortSignal,
): Promise<YouTubePlaybackCheck> {
  await loadYouTubeIframeApi();
  if (signal?.aborted) return { playable: false };

  return probePlayer(signal, {
    timeoutMs: PLAY_PROBE_MS,
    settleMs: PLAY_SETTLE_MS,
    mute: true,
    onReady: (player) => {
      player.mute();
      player.loadVideoById(videoId);
      player.playVideo();
    },
    onState: (state, armSettle) => {
      if (state === YT_PLAYING) armSettle();
    },
  });
}

export async function verifyYouTubeEmbeddable(
  videoId: string,
  signal?: AbortSignal,
): Promise<boolean> {
  if (!videoId) return false;
  const result = await runExclusive(() => verifyEmbeddableOnce(videoId, signal));
  return result.playable;
}

export async function verifyYouTubePlayback(
  videoId: string,
  signal?: AbortSignal,
): Promise<YouTubePlaybackCheck> {
  if (!videoId) return { playable: false };
  return runExclusive(() => verifyPlaybackOnce(videoId, signal));
}

export async function filterEmbeddableVideoIds(
  videoIds: string[],
  signal: AbortSignal | undefined,
  onVerified: (videoId: string) => void,
  maxResults?: number,
): Promise<number> {
  if (videoIds.length === 0) return 0;

  let verified = 0;
  let index = 0;

  async function worker() {
    while (!signal?.aborted) {
      if (maxResults !== undefined && verified >= maxResults) break;
      const at = index++;
      if (at >= videoIds.length) break;
      const id = videoIds[at]!;
      if (await verifyYouTubeEmbeddable(id, signal)) {
        if (maxResults !== undefined && verified >= maxResults) break;
        if (signal?.aborted) break;
        verified++;
        onVerified(id);
      }
    }
  }

  await Promise.all(Array.from({ length: PROBE_WORKERS }, () => worker()));
  return verified;
}

/** Playlist import: play-probe each id in parallel. Failures are skipped, not fatal. */
export async function filterPlayableVideoIds(
  videoIds: string[],
  signal: AbortSignal | undefined,
  onVerified: (videoId: string) => void,
): Promise<number> {
  if (videoIds.length === 0) return 0;
  await loadYouTubeIframeApi();
  if (signal?.aborted) return 0;

  let verified = 0;
  let index = 0;

  async function worker() {
    while (!signal?.aborted) {
      const at = index++;
      if (at >= videoIds.length) break;
      const id = videoIds[at]!;
      const check = await verifyPlaybackOnce(id, signal);
      if (!check.playable || signal?.aborted) continue;
      verified++;
      onVerified(id);
    }
  }

  const workers = Math.min(PLAY_FILTER_WORKERS, videoIds.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return verified;
}

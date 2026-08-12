import { loadYouTubeIframeApi } from "./youtube";

const YT_CUED = 5;
const YT_PLAYING = 1;
const EMBED_PROBE_MS = 2500;
const EMBED_SETTLE_MS = 350;
const PLAY_PROBE_MS = 8000;
const PLAY_SETTLE_MS = 500;
const PROBE_WORKERS = 3;

type YtPlayer = {
  cueVideoById: (id: string) => void;
  loadVideoById: (id: string) => void;
  playVideo: () => void;
  destroy: () => void;
};

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
    onReady: (player: YtPlayer, finish: (ok: boolean) => void) => void;
    onState: (state: number, armSettle: () => void) => void;
  },
): Promise<boolean> {
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

    const finish = (ok: boolean) => {
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
      resolve(ok);
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
      },
      events: {
        onReady: () => {
          try {
            opts.onReady(player!, finish);
          } catch {
            finish(false);
          }
        },
        onStateChange: (event: { data: number }) => {
          opts.onState(event.data, armSettle);
        },
        onError: () => finish(false),
      },
    });
  });
}

// Search filter: cue the embed (no autoplay) — works without a fresh user gesture.
async function verifyEmbeddableOnce(
  videoId: string,
  signal?: AbortSignal,
): Promise<boolean> {
  await loadYouTubeIframeApi();
  if (signal?.aborted) return false;

  return probePlayer(signal, {
    timeoutMs: EMBED_PROBE_MS,
    settleMs: EMBED_SETTLE_MS,
    onReady: (player) => player.cueVideoById(videoId),
    onState: (state, armSettle) => {
      if (state === YT_CUED) armSettle();
    },
  });
}

// Stricter check when the user explicitly plays a preview (gesture present).
async function verifyPlaybackOnce(
  videoId: string,
  signal?: AbortSignal,
): Promise<boolean> {
  await loadYouTubeIframeApi();
  if (signal?.aborted) return false;

  return probePlayer(signal, {
    timeoutMs: PLAY_PROBE_MS,
    settleMs: PLAY_SETTLE_MS,
    onReady: (player) => {
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
  return runExclusive(() => verifyEmbeddableOnce(videoId, signal));
}

export async function verifyYouTubePlayback(
  videoId: string,
  signal?: AbortSignal,
): Promise<boolean> {
  if (!videoId) return false;
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

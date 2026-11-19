import { sanitizeCursorAssetUrl } from "@/lib/inputValidation";

interface AudioCacheEntry {
  blobUrl?: string;
  onsetOffsetSec?: number;
  element?: HTMLAudioElement;
  loading?: Promise<void>;
}

const audioCache = new Map<string, AudioCacheEntry>();
let sharedAudioCtx: AudioContext | null = null;

function getSharedAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (sharedAudioCtx && sharedAudioCtx.state !== "closed") {
    return sharedAudioCtx;
  }
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;
  try {
    sharedAudioCtx = new AudioCtx();
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

const ONSET_SESSION_CACHE_KEY = "lou_scare_audio_onset_v1";

function readCachedOnsetSec(cleanUrl: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(ONSET_SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, number>;
    const val = parsed?.[cleanUrl];
    return typeof val === "number" && Number.isFinite(val) && val >= 0
      ? val
      : null;
  } catch {
    return null;
  }
}

function writeCachedOnsetSec(cleanUrl: string, onsetSec: number): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(ONSET_SESSION_CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const keys = Object.keys(parsed);
    if (keys.length > 16) {
      delete parsed[keys[0]];
    }
    parsed[cleanUrl] = Math.round(onsetSec * 1000) / 1000;
    window.sessionStorage.setItem(
      ONSET_SESSION_CACHE_KEY,
      JSON.stringify(parsed)
    );
  } catch {
    // Ignore storage quota or private browsing errors
  }
}

/**
 * Computes peak-relative audio onset while calling `getChannelData(ch)` at most
 * ONCE per channel (avoiding 100k+ Web Audio / Brave farbling crossings on the main thread).
 */
function detectAudioOnsetSeconds(buffer: AudioBuffer): number {
  const sampleRate = buffer.sampleRate || 44100;
  if (buffer.length === 0 || buffer.numberOfChannels === 0) return 0;

  const channels = Math.min(2, buffer.numberOfChannels);
  const channelDataList: Float32Array[] = [];
  for (let ch = 0; ch < channels; ch++) {
    channelDataList.push(buffer.getChannelData(ch));
  }

  let globalPeak = 0;
  const peakStep = Math.max(64, Math.floor(sampleRate * 0.004));
  for (let ch = 0; ch < channelDataList.length; ch++) {
    const data = channelDataList[ch];
    for (let i = 0; i < data.length; i += peakStep) {
      const v = Math.abs(data[i]);
      if (v > globalPeak) globalPeak = v;
    }
  }

  if (globalPeak < 0.01) return 0;

  const threshold = Math.min(0.08, Math.max(0.02, globalPeak * 0.08));
  const maxScanSamples = Math.min(
    Math.floor(buffer.length * 0.65),
    Math.floor(sampleRate * 2.0)
  );
  const onsetStep = Math.max(32, Math.floor(sampleRate * 0.002));

  for (let i = 0; i < maxScanSamples; i += onsetStep) {
    for (let ch = 0; ch < channelDataList.length; ch++) {
      if (Math.abs(channelDataList[ch][i]) >= threshold) {
        const rawSec = i / sampleRate;
        return Math.max(0, rawSec - 0.008);
      }
    }
  }
  return 0;
}

async function detectOnsetOffThread(ab: ArrayBuffer): Promise<number> {
  if (typeof window === "undefined") return 0;
  const OfflineCtx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;

  if (!OfflineCtx) return 0;
  try {
    const offline = new OfflineCtx(1, 1, 44100);
    const decoded = await offline.decodeAudioData(ab.slice(0));
    return detectAudioOnsetSeconds(decoded);
  } catch {
    return 0;
  }
}

function scheduleDeferredOnsetDetection(
  cleanUrl: string,
  entry: AudioCacheEntry,
  blob: Blob
): void {
  const cached = readCachedOnsetSec(cleanUrl);
  if (cached !== null) {
    entry.onsetOffsetSec = cached;
    if (entry.element && entry.element.paused && cached > 0) {
      try {
        if (entry.element.readyState >= 1) {
          entry.element.currentTime = cached;
        }
      } catch {
        // Ignore seek
      }
    }
    return;
  }

  const runDecode = () => {
    void blob
      .arrayBuffer()
      .then((ab) => detectOnsetOffThread(ab))
      .then((onset) => {
        entry.onsetOffsetSec = onset;
        writeCachedOnsetSec(cleanUrl, onset);
        if (entry.element && entry.element.paused && onset > 0) {
          try {
            if (entry.element.readyState >= 1) {
              entry.element.currentTime = onset;
            }
          } catch {
            // Ignore seek
          }
        }
      })
      .catch(() => {});
  };

  if (typeof window === "undefined") return;
  const winIdle = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  };
  window.setTimeout(() => {
    if (typeof winIdle.requestIdleCallback === "function") {
      winIdle.requestIdleCallback(runDecode, { timeout: 2500 });
    } else {
      runDecode();
    }
  }, 1400);
}

function attachPreloadedElement(entry: AudioCacheEntry, src: string): void {
  if (typeof Audio === "undefined") return;
  const el = new Audio();
  el.preload = "auto";
  el.src = src;

  const preSeekToOnset = () => {
    const offset = entry.onsetOffsetSec ?? 0;
    if (offset > 0 && el.paused && el.duration && offset < el.duration - 0.05) {
      try {
        el.currentTime = offset;
      } catch {
        // Ignore seek restriction before frame ready
      }
    }
  };

  el.addEventListener("loadedmetadata", preSeekToOnset, { once: true });
  el.load();
  entry.element = el;
}

function getOrCreateCacheEntry(cleanUrl: string): AudioCacheEntry {
  let entry = audioCache.get(cleanUrl);
  if (!entry) {
    entry = {};
    audioCache.set(cleanUrl, entry);
  }
  return entry;
}

/**
 * Does not construct a hardware `AudioContext` on page load (avoiding Brave/Windows
 * main-thread stalls); only resumes an already-created context on gesture if needed.
 */
export function ensureAudioContextUnlocked(): void {
  if (typeof window === "undefined") return;
  if (sharedAudioCtx && sharedAudioCtx.state === "suspended") {
    void sharedAudioCtx.resume().catch(() => {});
  }
}

/**
 * Immediately stores an uploaded audio File in RAM as a pre-seeked Blob `HTMLAudioElement`
 * so admin previews & immediate tests fire loudly with zero network or Web Audio issues.
 */
export function registerInstantAudio(remoteUrl: string, file: Blob): void {
  const cleanUrl = sanitizeCursorAssetUrl(remoteUrl);
  if (!cleanUrl || typeof URL === "undefined") return;

  const entry = getOrCreateCacheEntry(cleanUrl);
  if (entry.blobUrl && entry.blobUrl.startsWith("blob:")) {
    URL.revokeObjectURL(entry.blobUrl);
  }
  const blobUrl = URL.createObjectURL(file);
  entry.blobUrl = blobUrl;
  attachPreloadedElement(entry, blobUrl);
  scheduleDeferredOnsetDetection(cleanUrl, entry, file);
}

/**
 * Background-downloads configured jumpscare audio on page load into an in-RAM
 * Blob `HTMLAudioElement` immediately, then detects leading silence lazily off
 * the hot startup path so Preloader & hydration never stall.
 */
export function preloadJumpscareAudio(rawUrl?: string | null): void {
  if (typeof window === "undefined") return;

  const cleanUrl = sanitizeCursorAssetUrl(rawUrl);
  if (!cleanUrl) return;

  const entry = getOrCreateCacheEntry(cleanUrl);
  if (entry.blobUrl || entry.loading) return;

  const isExternalHttp = /^https?:\/\//i.test(cleanUrl);

  entry.loading = fetch(cleanUrl, {
    mode: isExternalHttp ? "cors" : "same-origin",
    credentials: "omit",
    cache: "force-cache",
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();

      if (!entry.blobUrl && typeof URL !== "undefined") {
        const blobUrl = URL.createObjectURL(blob);
        entry.blobUrl = blobUrl;
        attachPreloadedElement(entry, blobUrl);
      }

      scheduleDeferredOnsetDetection(cleanUrl, entry, blob);
    })
    .catch(() => {
      // Fallback safely to direct URL playback if CORS fetch fails
    })
    .finally(() => {
      entry.loading = undefined;
    });
}

function playProceduralStingOnRunningCtx(
  ctx: AudioContext,
  volume: number,
  canceledRef: { canceled: boolean },
  stopCallbackRef: { fn: () => void }
): void {
  if (canceledRef.canceled) return;
  try {
    const now = ctx.currentTime;
    const duration = 1.2;
    const safeVol = Math.max(0.05, Math.min(1, volume));

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-14, now);
    compressor.knee.setValueAtTime(10, now);
    compressor.ratio.setValueAtTime(10, now);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(safeVol * 0.92, now);
    masterGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    compressor.connect(masterGain);
    masterGain.connect(ctx.destination);

    const freqs = [277.18, 293.66, 554.37, 587.33, 880];
    const oscNodes: OscillatorNode[] = [];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = idx % 2 === 0 ? "sawtooth" : "square";
      osc.frequency.setValueAtTime(f * 1.12, now);
      osc.frequency.exponentialRampToValueAtTime(f * 0.84, now + duration);
      oscGain.gain.setValueAtTime(0.24, now);
      osc.connect(oscGain);
      oscGain.connect(compressor);
      osc.start(now);
      osc.stop(now + duration);
      oscNodes.push(osc);
    });

    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(135, now);
    sub.frequency.exponentialRampToValueAtTime(28, now + 0.65);
    subGain.gain.setValueAtTime(0.9, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    sub.connect(subGain);
    subGain.connect(compressor);
    sub.start(now);
    sub.stop(now + 0.85);
    oscNodes.push(sub);

    const bufferSize = Math.floor(ctx.sampleRate * 0.65);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const channelData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      channelData[i] =
        (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 0.7);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1850, now);
    filter.Q.setValueAtTime(0.9, now);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.75, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(compressor);
    noise.start(now);

    stopCallbackRef.fn = () => {
      try {
        masterGain.gain.setValueAtTime(0.0001, ctx.currentTime);
        masterGain.disconnect();
        oscNodes.forEach((n) => {
          try {
            n.stop();
          } catch {
            // Ignore already stopped
          }
        });
        noise.stop();
      } catch {
        // Ignore cleanup
      }
    };
  } catch {
    // Ignore synth failure
  }
}

function playProceduralStingSafe(volume: number): () => void {
  const ctx = getSharedAudioContext();
  if (!ctx) return () => {};

  const canceledRef = { canceled: false };
  const stopCallbackRef = { fn: () => {} };

  if (ctx.state === "running") {
    playProceduralStingOnRunningCtx(ctx, volume, canceledRef, stopCallbackRef);
  } else {
    void ctx
      .resume()
      .then(() => {
        playProceduralStingOnRunningCtx(
          ctx,
          volume,
          canceledRef,
          stopCallbackRef
        );
      })
      .catch(() => {});
  }

  return () => {
    canceledRef.canceled = true;
    stopCallbackRef.fn();
  };
}

export const DEFAULT_JUMPSCARE_VOLUME = 0.65;

/**
 * Resolves a numeric jumpscare volume in `[0, 1]` while preserving `0` (muted).
 */
export function resolveJumpscareVolume(volume?: unknown): number {
  if (typeof volume === "number") {
    return Number.isFinite(volume)
      ? Math.max(0, Math.min(1, volume))
      : DEFAULT_JUMPSCARE_VOLUME;
  }
  if (typeof volume === "string" && volume.trim() !== "") {
    const parsed = Number(volume);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.min(1, parsed));
    }
  }
  return DEFAULT_JUMPSCARE_VOLUME;
}

/**
 * Plays pre-buffered in-RAM `blob:` `HTMLAudioElement` synchronously inside the active
 * user gesture tick (immune to suspended `AudioContext` locks & Brave Web Audio farbling),
 * or falls back cleanly to the Web Audio synth sting when no clip is configured.
 */
export function startJumpscareAudioInstant(
  rawUrl?: string | null,
  volume: unknown = DEFAULT_JUMPSCARE_VOLUME
): () => void {
  if (typeof window === "undefined") return () => {};

  const safeVol = resolveJumpscareVolume(volume);
  if (safeVol <= 0.01) {
    return () => {};
  }

  const cleanUrl = sanitizeCursorAssetUrl(rawUrl);
  if (!cleanUrl) {
    return playProceduralStingSafe(safeVol);
  }

  const entry = getOrCreateCacheEntry(cleanUrl);
  if (!entry.blobUrl && !entry.loading) {
    preloadJumpscareAudio(cleanUrl);
  }

  const src = entry.blobUrl || cleanUrl;
  try {
    const audio =
      entry.element && entry.element.src ? entry.element : new Audio(src);
    if (!entry.element) {
      audio.preload = "auto";
      entry.element = audio;
    }

    const seekSec = entry.onsetOffsetSec ?? 0;
    try {
      const targetTime =
        audio.duration && Number.isFinite(audio.duration)
          ? Math.min(seekSec, Math.max(0, audio.duration - 0.05))
          : seekSec;
      if (Math.abs(audio.currentTime - targetTime) > 0.02) {
        audio.currentTime = targetTime;
      }
    } catch {
      // Ignore seek before metadata loaded
    }

    audio.muted = false;
    audio.volume = safeVol;

    let fallbackStop: (() => void) | null = null;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        fallbackStop = playProceduralStingSafe(safeVol);
      });
    }

    return () => {
      try {
        fallbackStop?.();
        audio.pause();
        const resetTime = entry.onsetOffsetSec ?? 0;
        if (
          audio.duration &&
          Number.isFinite(audio.duration) &&
          resetTime < audio.duration - 0.05
        ) {
          audio.currentTime = resetTime;
        } else {
          audio.currentTime = 0;
        }
      } catch {
        // Ignore cleanup errors
      }
    };
  } catch {
    return playProceduralStingSafe(safeVol);
  }
}

export async function startJumpscareAudio(
  rawUrl?: string | null,
  volume = 0.75
): Promise<() => void> {
  return startJumpscareAudioInstant(rawUrl, volume);
}

export function playJumpscareAudio(
  rawUrl?: string | null,
  volume = 0.75
): () => void {
  return startJumpscareAudioInstant(rawUrl, volume);
}

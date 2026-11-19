import type { ClientDeviceTelemetry, DeviceType } from "@/types/security";

interface UAClientData {
  mobile?: boolean;
  platform?: string;
  brands?: Array<{ brand: string; version: string }>;
  getHighEntropyValues?: (
    hints: string[]
  ) => Promise<{
    architecture?: string;
    model?: string;
    platform?: string;
    platformVersion?: string;
    fullVersionList?: Array<{ brand: string; version: string }>;
  }>;
}

const KEY_DB_NAME = "lou_admin_device_identity_v1";
const KEY_STORE_NAME = "ecdsa_keys";
const KEY_RECORD_ID = "primary_device_keypair";

/**
 * Parses a standard User-Agent header cleanly when Client Hints are absent
 * (e.g., iOS Safari, Firefox, or server-side inspection).
 */
export function parseUserAgentSummary(userAgent: string): {
  browser: string;
  platform: string;
  osVersion: string;
  model: string;
  deviceType: DeviceType;
} {
  const ua = userAgent || "";

  let browser = "Unknown Browser";
  if (/Brave/i.test(ua)) browser = "Brave";
  else if (/EdgA?|Edge/i.test(ua)) browser = "Microsoft Edge";
  else if (/OPR|Opera/i.test(ua)) browser = "Opera";
  else if (/SamsungBrowser/i.test(ua)) browser = "Samsung Internet";
  else if (/CriOS/i.test(ua)) browser = "Chrome iOS";
  else if (/FxiOS/i.test(ua)) browser = "Firefox iOS";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Chrome\//i.test(ua) && !/Edg/i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua) && !/Chrome|Chromium/i.test(ua)) browser = "Safari";

  let platform = "Unknown OS";
  let osVersion = "";
  let model = "Workstation / Browser";
  let deviceType: DeviceType = "desktop";

  if (/iPhone/i.test(ua)) {
    platform = "iOS";
    const match = ua.match(/OS (\d+[_\d]*)/i);
    osVersion = match ? match[1].replace(/_/g, ".") : "";
    model = "Apple iPhone";
    deviceType = "mobile";
  } else if (/iPad/i.test(ua)) {
    platform = "iPadOS";
    const match = ua.match(/OS (\d+[_\d]*)/i);
    osVersion = match ? match[1].replace(/_/g, ".") : "";
    model = "Apple iPad";
    deviceType = "tablet";
  } else if (/Android/i.test(ua)) {
    platform = "Android";
    const verMatch = ua.match(/Android\s+([0-9.]+)/i);
    osVersion = verMatch ? verMatch[1] : "";
    const modelMatch = ua.match(/Android[^;)]+;\s*([^;)]+?)(?:\s+Build\/|[;)])/i);
    const extractedModel = modelMatch?.[1]?.trim();
    model =
      extractedModel && extractedModel.toUpperCase() !== "K"
        ? extractedModel
        : "Android Smartphone";
    deviceType = /Tablet|SM-T|Tab/i.test(ua) ? "tablet" : "mobile";
  } else if (/Windows NT/i.test(ua)) {
    platform = "Windows";
    if (/Windows NT 10\.0/i.test(ua)) osVersion = "10/11";
    model = "Windows PC";
    deviceType = "desktop";
  } else if (/Mac OS X|Macintosh/i.test(ua)) {
    platform = "macOS";
    const match = ua.match(/Mac OS X (\d+[_\d]*)/i);
    osVersion = match ? match[1].replace(/_/g, ".") : "";
    model = "Apple Mac";
    deviceType = "desktop";
  } else if (/CrOS/i.test(ua)) {
    platform = "ChromeOS";
    model = "Chromebook";
    deviceType = "desktop";
  } else if (/Linux/i.test(ua)) {
    platform = "Linux";
    model = "Linux Workstation";
    deviceType = "desktop";
  }

  return { browser, platform, osVersion, model, deviceType };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  return arrayBufferToBase64(buffer)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function formatThumbprint(digestBuffer: ArrayBuffer): string {
  const bytes = Array.from(new Uint8Array(digestBuffer)).slice(0, 6);
  const hex = bytes
    .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
    .join("");
  return `DEV-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

async function openKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(KEY_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KEY_STORE_NAME)) {
        db.createObjectStore(KEY_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readStoredKeypair(
  db: IDBDatabase
): Promise<CryptoKeyPair | null> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(KEY_STORE_NAME, "readonly");
      const store = tx.objectStore(KEY_STORE_NAME);
      const req = store.get(KEY_RECORD_ID);
      req.onsuccess = () => resolve((req.result as CryptoKeyPair) || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeStoredKeypair(
  db: IDBDatabase,
  pair: CryptoKeyPair
): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(KEY_STORE_NAME, "readwrite");
      const store = tx.objectStore(KEY_STORE_NAME);
      store.put(pair, KEY_RECORD_ID);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Deletes the stored WebCrypto ECDSA P-256 keypair from IndexedDB when a device is
 * explicitly unregistered/revoked so background recovery does not silently re-trust it.
 */
export async function clearStoredClientDeviceKey(): Promise<void> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    return;
  }
  try {
    const db = await openKeyDb();
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(KEY_STORE_NAME, "readwrite");
        const store = tx.objectStore(KEY_STORE_NAME);
        store.delete(KEY_RECORD_ID);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  } catch {
    // Ignore IndexedDB error
  }
}

/**
 * Synchronous first-frame preview of client telemetry so UI cards never flicker
 * "Inspecting browser capabilities..." while async WebCrypto / Client Hints resolve.
 */
export function getInitialClientTelemetryPreview(): ClientDeviceTelemetry | null {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return null;
  }
  const uaSummary = parseUserAgentSummary(navigator.userAgent);
  const screenMetrics =
    window.screen?.width && window.screen?.height
      ? `${window.screen.width}×${window.screen.height}`
      : null;
  const cpuCores =
    typeof navigator.hardwareConcurrency === "number"
      ? navigator.hardwareConcurrency
      : null;
  const osLabel = uaSummary.osVersion
    ? `${uaSummary.platform} ${uaSummary.osVersion}`
    : uaSummary.platform;
  const suggestedName =
    uaSummary.deviceType === "mobile" || uaSummary.deviceType === "tablet"
      ? `${uaSummary.model} · ${uaSummary.browser}`.slice(0, 56)
      : `${osLabel} · ${uaSummary.browser}`.slice(0, 56);

  return {
    suggestedName,
    model: uaSummary.model,
    platform: uaSummary.platform,
    osVersion: uaSummary.osVersion,
    browser: uaSummary.browser,
    architecture: null,
    cpuCores,
    gpuRenderer: null,
    screenMetrics,
    timezone: null,
    deviceType: uaSummary.deviceType,
    keyThumbprint: null,
    publicKeySpki: null,
    secureContext: Boolean(window.isSecureContext && window.crypto?.subtle),
  };
}

/**
 * Synchronous initial snapshot for `RecognitionHealthCard` so the diagnostics grid
 * renders on the very first frame without layout jump.
 */
export function getInitialRecognitionHealthSnapshot(
  knownThumbprint?: string | null
): ClientRecognitionHealth | null {
  if (typeof window === "undefined") {
    return null;
  }
  const origin = window.location.origin;
  const hostname = window.location.hostname;
  const isPreviewHost =
    hostname.endsWith(".vercel.app") &&
    hostname !== "louvaldellon.vercel.app" &&
    hostname.includes("-");
  const secureContext = Boolean(window.isSecureContext && window.crypto?.subtle);
  const localHintCached =
    window.localStorage?.getItem("lou_registered_device") === "true";

  return {
    origin,
    hostname,
    isPreviewHost,
    secureContext,
    hasIndexedDbKey: Boolean(knownThumbprint),
    keyThumbprint: knownThumbprint || null,
    storagePersisted: null,
    localHintCached,
  };
}

/**
 * Requests persistent browser storage so IndexedDB ECDSA device keys are protected
 * from automatic browser storage-pressure eviction.
 */
export async function requestPersistentDeviceStorage(): Promise<boolean | null> {
  if (
    typeof window === "undefined" ||
    typeof navigator === "undefined" ||
    !navigator.storage
  ) {
    return null;
  }

  try {
    if (typeof navigator.storage.persisted === "function") {
      const alreadyPersisted = await navigator.storage.persisted();
      if (alreadyPersisted) return true;
    }
    if (typeof navigator.storage.persist === "function") {
      return await navigator.storage.persist();
    }
    return null;
  } catch {
    return null;
  }
}

export interface ClientRecognitionHealth {
  origin: string;
  hostname: string;
  isPreviewHost: boolean;
  secureContext: boolean;
  hasIndexedDbKey: boolean;
  keyThumbprint: string | null;
  storagePersisted: boolean | null;
  localHintCached: boolean;
}

/**
 * Inspects client-side device recognition layers without generating a new keypair
 * unless `ensureKeypair` is explicitly passed.
 */
export async function inspectDeviceRecognitionHealth(options?: {
  ensureKeypair?: boolean;
}): Promise<ClientRecognitionHealth> {
  if (typeof window === "undefined") {
    return {
      origin: "",
      hostname: "",
      isPreviewHost: false,
      secureContext: false,
      hasIndexedDbKey: false,
      keyThumbprint: null,
      storagePersisted: null,
      localHintCached: false,
    };
  }

  const origin = window.location.origin;
  const hostname = window.location.hostname;
  const isPreviewHost =
    hostname.endsWith(".vercel.app") &&
    hostname !== "louvaldellon.vercel.app" &&
    hostname.includes("-");
  const secureContext = Boolean(window.isSecureContext && window.crypto?.subtle);
  const localHintCached =
    window.localStorage?.getItem("lou_registered_device") === "true";

  let storagePersisted: boolean | null = null;
  try {
    if (typeof navigator?.storage?.persisted === "function") {
      storagePersisted = await navigator.storage.persisted();
    }
  } catch {
    storagePersisted = null;
  }

  let hasIndexedDbKey = false;
  let keyThumbprint: string | null = null;

  if (secureContext && typeof indexedDB !== "undefined") {
    try {
      if (options?.ensureKeypair) {
        const created = await getOrCreateClientDeviceKey();
        hasIndexedDbKey = Boolean(created.keyThumbprint);
        keyThumbprint = created.keyThumbprint;
      } else {
        const db = await openKeyDb();
        const pair = await readStoredKeypair(db);
        if (pair?.publicKey && pair?.privateKey) {
          const spki = await window.crypto.subtle.exportKey(
            "spki",
            pair.publicKey
          );
          const digest = await window.crypto.subtle.digest("SHA-256", spki);
          hasIndexedDbKey = true;
          keyThumbprint = formatThumbprint(digest);
        }
      }
    } catch {
      hasIndexedDbKey = false;
      keyThumbprint = null;
    }
  }

  return {
    origin,
    hostname,
    isPreviewHost,
    secureContext,
    hasIndexedDbKey,
    keyThumbprint,
    storagePersisted,
    localHintCached,
  };
}

/**
 * Generates or loads a non-extractable ECDSA P-256 hardware/browser keypair in IndexedDB.
 * Returns null cleanly when running on insecure plain-HTTP LAN origins where SubtleCrypto is restricted.
 */
async function getOrCreateClientDeviceKey(): Promise<{
  publicKeySpki: string | null;
  keyThumbprint: string | null;
  secureContext: boolean;
}> {
  if (typeof window === "undefined") {
    return { publicKeySpki: null, keyThumbprint: null, secureContext: false };
  }

  const secureContext = Boolean(window.isSecureContext && window.crypto?.subtle);
  if (!secureContext || typeof indexedDB === "undefined") {
    return { publicKeySpki: null, keyThumbprint: null, secureContext };
  }

  try {
    const db = await openKeyDb();
    let pair = await readStoredKeypair(db);

    if (!pair?.publicKey || !pair?.privateKey) {
      pair = await window.crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        false, // Non-extractable private key prevents cookie/key theft
        ["sign", "verify"]
      );
      await writeStoredKeypair(db, pair);
    }

    void requestPersistentDeviceStorage();

    const spki = await window.crypto.subtle.exportKey("spki", pair.publicKey);
    const digest = await window.crypto.subtle.digest("SHA-256", spki);
    return {
      publicKeySpki: arrayBufferToBase64(spki),
      keyThumbprint: formatThumbprint(digest),
      secureContext: true,
    };
  } catch {
    return { publicKeySpki: null, keyThumbprint: null, secureContext };
  }
}

/**
 * Checks whether an ECDSA P-256 keypair already exists in IndexedDB (without creating one
 * for unauthenticated visitors) and signs a server challenge to recover `lou_registered_device`.
 */
export async function signExistingDeviceChallenge(challenge: string): Promise<{
  keyThumbprint: string;
  signature: string;
} | null> {
  if (
    typeof window === "undefined" ||
    !challenge ||
    !window.isSecureContext ||
    !window.crypto?.subtle ||
    typeof indexedDB === "undefined"
  ) {
    return null;
  }

  try {
    const db = await openKeyDb();
    const pair = await readStoredKeypair(db);
    if (!pair?.publicKey || !pair?.privateKey) {
      return null;
    }

    const spki = await window.crypto.subtle.exportKey("spki", pair.publicKey);
    const digest = await window.crypto.subtle.digest("SHA-256", spki);
    const keyThumbprint = formatThumbprint(digest);

    const encodedChallenge = new TextEncoder().encode(challenge);
    const signatureBuf = await window.crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      pair.privateKey,
      encodedChallenge
    );

    return {
      keyThumbprint,
      signature: arrayBufferToBase64Url(signatureBuf),
    };
  } catch {
    return null;
  }
}

/**
 * Safely reads the browser's unmasked WebGL GPU renderer string (when permitted)
 * and trims ANGLE wrappers for clean human-readable hardware summaries.
 */
function detectGpuRenderer(): string | null {
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl || !("getExtension" in gl)) return null;

    const webgl = gl as WebGLRenderingContext;
    const debugInfo = webgl.getExtension("WEBGL_debug_renderer_info");
    if (!debugInfo) return null;

    const raw = webgl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    if (typeof raw !== "string" || !raw.trim()) return null;

    // Clean strings like "ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Direct3D11...)"
    const angleMatch = raw.match(/^ANGLE\s*\(([^)]+)\)$/i);
    if (angleMatch) {
      const segments = angleMatch[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const gpuPart = segments.length > 1 ? segments[1] : segments[0];
      return gpuPart.replace(/\s+Direct3D.*$/i, "").slice(0, 64);
    }

    return raw.trim().slice(0, 64);
  } catch {
    return null;
  }
}

/**
 * Collects genuine platform, model, browser, hardware specs, and WebCrypto device key fingerprint.
 */
export async function collectClientDeviceTelemetry(): Promise<ClientDeviceTelemetry> {
  if (typeof window === "undefined") {
    return {
      suggestedName: "Unknown Device",
      model: "Server Session",
      platform: "Unknown",
      osVersion: "",
      browser: "Unknown",
      architecture: null,
      cpuCores: null,
      gpuRenderer: null,
      screenMetrics: null,
      timezone: null,
      deviceType: "desktop",
      keyThumbprint: null,
      publicKeySpki: null,
      secureContext: false,
    };
  }

  const uaSummary = parseUserAgentSummary(navigator.userAgent);
  let browser = uaSummary.browser;
  let platform = uaSummary.platform;
  let osVersion = uaSummary.osVersion;
  let model = uaSummary.model;
  let architecture: string | null = null;
  let deviceType = uaSummary.deviceType;

  // Brave exposes an async detector on navigator
  try {
    const navWithBrave = navigator as Navigator & {
      brave?: { isBrave?: () => Promise<boolean> };
      userAgentData?: UAClientData;
    };
    if (navWithBrave.brave?.isBrave && (await navWithBrave.brave.isBrave())) {
      browser = "Brave";
    }

    if (navWithBrave.userAgentData?.getHighEntropyValues) {
      const high = await navWithBrave.userAgentData.getHighEntropyValues([
        "model",
        "platform",
        "platformVersion",
        "architecture",
        "fullVersionList",
      ]);

      if (high.platform) {
        platform = high.platform;
      }
      if (high.platform === "Windows" && high.platformVersion) {
        const major = parseInt(high.platformVersion.split(".")[0] || "0", 10);
        if (major >= 13) osVersion = "11";
        else if (major > 0) osVersion = "10";
      } else if (high.platformVersion) {
        osVersion = high.platformVersion.split(".").slice(0, 2).join(".");
      }

      if (high.model && high.model.trim()) {
        model = high.model.trim();
      } else if (platform === "macOS") {
        model = "Apple Mac";
      } else if (platform === "Windows") {
        model = "Windows PC";
      }

      if (high.architecture) {
        architecture = high.architecture;
      }

      if (navWithBrave.userAgentData.mobile) {
        deviceType = "mobile";
      }

      const preferredBrand = (high.fullVersionList || []).find(
        (b) =>
          !/Not.?A.?Brand|Chromium/i.test(b.brand) &&
          b.brand.trim().length > 0
      );
      if (preferredBrand && browser !== "Brave") {
        browser = preferredBrand.brand.replace(/^Google\s+/i, "");
      }
    }
  } catch {
    // Graceful fallback to standard UA parsing
  }

  const keyInfo = await getOrCreateClientDeviceKey();
  const gpuRenderer = detectGpuRenderer();
  const screenMetrics =
    window.screen?.width && window.screen?.height
      ? `${window.screen.width}×${window.screen.height}`
      : null;
  const cpuCores =
    typeof navigator.hardwareConcurrency === "number"
      ? navigator.hardwareConcurrency
      : null;
  let timezone: string | null = null;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    timezone = null;
  }

  const osLabel = osVersion ? `${platform} ${osVersion}` : platform;
  const suggestedName =
    deviceType === "mobile" || deviceType === "tablet"
      ? `${model} · ${browser}`.slice(0, 56)
      : `${osLabel} · ${browser}`.slice(0, 56);

  return {
    suggestedName,
    model,
    platform,
    osVersion,
    browser,
    architecture,
    cpuCores,
    gpuRenderer,
    screenMetrics,
    timezone,
    deviceType,
    keyThumbprint: keyInfo.keyThumbprint,
    publicKeySpki: keyInfo.publicKeySpki,
    secureContext: keyInfo.secureContext,
  };
}


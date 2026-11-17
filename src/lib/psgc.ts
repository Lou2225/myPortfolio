import { PsgcAddress } from "@/types/portfolio";

export interface PsgcRegion {
  code: string;
  name: string;
  regionName: string;
  islandGroupCode?: string;
}

export interface PsgcProvince {
  code: string;
  name: string;
  regionCode: string;
}

export interface PsgcCityMunicipality {
  code: string;
  name: string;
  isCity?: boolean;
  isMunicipality?: boolean;
  provinceCode?: string | false;
  regionCode?: string;
}

export interface PsgcBarangay {
  code: string;
  name: string;
  cityCode?: string | false;
  municipalityCode?: string | false;
}

const memoryCache = new Map<string, unknown>();
const STORAGE_PREFIX = "ldv_psgc_v1:";

function readStorageCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { expiresAt: number; data: T };
    if (!parsed || typeof parsed.expiresAt !== "number" || Date.now() > parsed.expiresAt) {
      window.localStorage.removeItem(STORAGE_PREFIX + key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function writeStorageCache<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_PREFIX + key,
      JSON.stringify({
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
        data,
      })
    );
  } catch {
    // Ignore storage quota issues
  }
}

async function fetchPsgc<T>(cacheKey: string, query: string): Promise<T[]> {
  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey) as T[];
  }

  const stored = readStorageCache<T[]>(cacheKey);
  if (stored) {
    memoryCache.set(cacheKey, stored);
    return stored;
  }

  const res = await fetch(`/api/psgc?${query}`);
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errBody.error || "Unable to load PSGC geographic directory.");
  }

  const rows = (await res.json()) as T[];
  const sorted = [...rows].sort((a, b) => {
    const nameA = (a as { name?: string }).name || "";
    const nameB = (b as { name?: string }).name || "";
    return nameA.localeCompare(nameB);
  });

  memoryCache.set(cacheKey, sorted);
  writeStorageCache(cacheKey, sorted);
  return sorted;
}

export function fetchPsgcRegions(): Promise<PsgcRegion[]> {
  return fetchPsgc<PsgcRegion>("regions", "level=regions");
}

export function fetchPsgcProvincesByRegion(
  regionCode: string
): Promise<PsgcProvince[]> {
  return fetchPsgc<PsgcProvince>(
    `provinces:${regionCode}`,
    `level=provinces&code=${encodeURIComponent(regionCode)}`
  );
}

export function fetchPsgcCitiesByProvince(
  provinceCode: string
): Promise<PsgcCityMunicipality[]> {
  return fetchPsgc<PsgcCityMunicipality>(
    `cities-prov:${provinceCode}`,
    `level=cities&scope=province&code=${encodeURIComponent(provinceCode)}`
  );
}

export function fetchPsgcCitiesByRegion(
  regionCode: string
): Promise<PsgcCityMunicipality[]> {
  return fetchPsgc<PsgcCityMunicipality>(
    `cities-reg:${regionCode}`,
    `level=cities&scope=region&code=${encodeURIComponent(regionCode)}`
  );
}

export function fetchPsgcBarangaysByCity(
  cityCode: string
): Promise<PsgcBarangay[]> {
  return fetchPsgc<PsgcBarangay>(
    `barangays:${cityCode}`,
    `level=barangays&code=${encodeURIComponent(cityCode)}`
  );
}

/**
 * Format structured PSGC fields into a clean human-readable Philippine address string.
 */
export function formatPsgcLocation(address?: Partial<PsgcAddress>): string {
  if (!address) return "";
  const parts: string[] = [];

  if (address.barangayName?.trim()) {
    const cleanBrgy = address.barangayName.trim();
    parts.push(
      /^brgy\.?\s/i.test(cleanBrgy) ? cleanBrgy : `Brgy. ${cleanBrgy}`
    );
  }
  if (address.cityName?.trim()) {
    parts.push(address.cityName.trim());
  }
  if (address.provinceName?.trim()) {
    parts.push(address.provinceName.trim());
  }
  if (address.regionName?.trim()) {
    parts.push(address.regionName.trim());
  }

  return parts.join(", ");
}


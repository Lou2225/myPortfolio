import path from "path";

export class StorageReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageReadError";
  }
}

export class StorageWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageWriteError";
  }
}

/**
 * Resolves the local filesystem data directory dynamically so automated tests can isolate `PORTFOLIO_DATA_DIR`.
 */
export function resolveLocalDataDir(): string {
  const override = process.env.PORTFOLIO_DATA_DIR?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(process.cwd(), "data");
}

export function getStorageMode(): "supabase" | "local-json" {
  if (process.env.PORTFOLIO_FORCE_LOCAL_STORAGE === "1") {
    return "local-json";
  }
  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return "supabase";
  }
  return "local-json";
}

export function buildSupabaseHeaders(
  key: string,
  extraHeaders?: Record<string, string>
): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: key,
    ...extraHeaders,
  };

  // Modern sb_secret_ keys authenticate solely via apikey and must not be sent as Bearer JWTs
  if (!key.startsWith("sb_secret_")) {
    headers.Authorization = `Bearer ${key}`;
  }

  return headers;
}

/**
 * Recursively sorts plain-object keys so JSON serialization is byte-identical
 * across Node.js, browser JS engines, and PostgreSQL JSONB (which reorders keys
 * by length then codepoint).
 */
export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(canonicalizeValue(value));
}

function canonicalizeValue(value: unknown): unknown {
  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalizeValue);
  }
  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(record).sort();
  for (const key of keys) {
    const child = record[key];
    if (child !== undefined) {
      sorted[key] = canonicalizeValue(child);
    }
  }
  return sorted;
}

/**
 * BigInt-safe JSON serialization (§5.4).
 * Internal BigInt PKs must never leak — strip `id` fields and convert any
 * remaining BigInt to string. External references always use `publicId`.
 */

const INTERNAL_KEYS = new Set(["id", "tenantId", "passwordHash", "tokenHash"]);

export function serialize<T>(value: T): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (INTERNAL_KEYS.has(k)) continue;
      out[k] = serialize(v);
    }
    return out;
  }
  return value;
}

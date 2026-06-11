"use client";

/** Envelope-aware fetch helper for client components. */
export class ClientApiError extends Error {
  code: string;
  details?: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export async function api<T>(
  url: string,
  init?: RequestInit,
): Promise<{ data: T; meta?: { page: number; pageSize: number; total: number } }> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const json = await res.json().catch(() => null);
  if (!json?.success) {
    throw new ClientApiError(
      json?.error?.code ?? "UNKNOWN",
      json?.error?.message ?? "Something went wrong",
      json?.error?.details,
    );
  }
  return { data: json.data as T, meta: json.meta };
}

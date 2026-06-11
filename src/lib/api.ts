import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { serialize } from "./serialize";

/**
 * Standard API response envelope (§5.4):
 * { success, data, error, meta }
 */

export type ApiMeta = {
  page?: number;
  pageSize?: number;
  total?: number;
  [key: string]: unknown;
};

export function ok<T>(data: T, meta?: ApiMeta, status = 200) {
  return NextResponse.json(
    { success: true, data: serialize(data), error: null, meta: meta ?? null },
    { status },
  );
}

export function created<T>(data: T, meta?: ApiMeta) {
  return ok(data, meta, 201);
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function fail(code: string, message: string, status = 400, details?: unknown) {
  return NextResponse.json(
    { success: false, data: null, error: { code, message, details: details ?? null }, meta: null },
    { status },
  );
}

/** Wrap a route handler: catches ApiError / ZodError / unknown into the envelope. */
export function handler<A extends unknown[]>(
  fn: (...args: A) => Promise<NextResponse>,
): (...args: A) => Promise<NextResponse> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) return fail(err.code, err.message, err.status, err.details);
      if (err instanceof ZodError)
        return fail("VALIDATION_ERROR", "Invalid input", 422, err.flatten());
      console.error("[api] unhandled error:", err);
      return fail("INTERNAL_ERROR", "Something went wrong", 500);
    }
  };
}

/** Parse and validate a JSON body against a Zod schema. */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new ApiError("INVALID_JSON", "Request body must be valid JSON", 400);
  }
  return schema.parse(json);
}

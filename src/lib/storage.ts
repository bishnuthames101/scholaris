import { createClient } from "@supabase/supabase-js";
import { ApiError } from "./api";

/**
 * Supabase Storage (server-only, service role).
 * Photos live in a public bucket under unguessable UUID paths:
 *   {tenantPublicId}/{entity}/{entityPublicId}.{ext}
 */

const BUCKET = "photos";
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2 MB

const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new ApiError("STORAGE_NOT_CONFIGURED", "Photo storage is not configured", 503);
  return createClient(url, key, { auth: { persistSession: false } });
}

export function photoExtension(contentType: string): string | null {
  return PHOTO_TYPES[contentType] ?? null;
}

/** Upload (upsert) a photo and return its public URL. */
export async function uploadPhoto(
  path: string,
  bytes: ArrayBuffer,
  contentType: string,
): Promise<string> {
  const supabase = client();

  let { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType,
    upsert: true,
  });

  // Lazily create the bucket on first use
  if (error && /bucket not found/i.test(error.message)) {
    await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_PHOTO_BYTES,
      allowedMimeTypes: Object.keys(PHOTO_TYPES),
    });
    ({ error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType,
      upsert: true,
    }));
  }
  if (error) throw new ApiError("UPLOAD_FAILED", `Photo upload failed: ${error.message}`, 502);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // Cache-bust so an updated photo shows immediately
  return `${data.publicUrl}?v=${Date.now()}`;
}

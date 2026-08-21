import { createAdminClient } from '@/lib/supabase/server';

/*
  Meal photos.

  This is the thing the coach already does over text every day: a client
  photographs a plate, the coach reads it and calls the macros. Putting it in
  the app means the photo lands next to the numbers the client entered, so the
  coach can correct a guess instead of reconstructing the meal from memory.

  Deliberately a separate module from progress-photos.ts rather than a shared
  helper. The two buckets have different sensitivity and different retention
  expectations, and progress photos are the single most private thing in the
  app — worth keeping their handling somewhere that can't be changed by
  accident while editing meal logging. If a third bucket ever shows up, that's
  the point to extract a common module.
*/

export const MEAL_PHOTO_BUCKET = 'meal-photos';

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

/** Returns an error message, or null when the file is fine. */
export function isAllowedMealPhoto(file: File) {
  if (!file || file.size === 0) return 'No photo selected.';
  if (file.size > MAX_BYTES) return 'That photo is too large — keep it under 12MB.';
  if (!ALLOWED.has(file.type)) return 'Photos need to be JPEG, PNG, WEBP or HEIC.';
  return null;
}

export function mealPhotoPath(clientId: string, filename: string) {
  const ext = (filename.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  // Timestamped so several meals on the same day never collide.
  return `${clientId}/${day}/${now.getTime()}.${ext}`;
}

export async function uploadMealPhoto(path: string, file: File) {
  const supabase = createAdminClient();
  const { error } = await supabase.storage
    .from(MEAL_PHOTO_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  return error?.message ?? null;
}

export async function removeMealPhoto(path: string) {
  const supabase = createAdminClient();
  await supabase.storage.from(MEAL_PHOTO_BUCKET).remove([path]);
}

/**
 * Signs a batch of paths in one round trip. The bucket is private and nothing
 * is ever served from a public URL — links expire in an hour, which outlives
 * a page view without leaving a URL that keeps working if it leaks.
 */
export async function signMealPhotoUrls(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const clean = paths.filter(Boolean);
  if (clean.length === 0) return out;

  const supabase = createAdminClient();
  const { data } = await supabase.storage.from(MEAL_PHOTO_BUCKET).createSignedUrls(clean, 3600);

  for (const row of data ?? []) {
    if (row.signedUrl && row.path) out.set(row.path, row.signedUrl);
  }
  return out;
}

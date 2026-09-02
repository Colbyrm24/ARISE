import { createAdminClient } from '@/lib/supabase/server';

export const PHOTO_BUCKET = 'progress-photos';
export const PHOTO_ANGLES = ['front', 'side', 'back'] as const;
export type PhotoAngle = (typeof PHOTO_ANGLES)[number];

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

/**
 * Progress photos are the most sensitive thing in this app. The bucket is
 * private, nothing is ever served from a public URL, and every read goes
 * through a short-lived signed URL minted on the server for a caller we have
 * already authorized. The storage path is never exposed to the browser.
 */
export function isAllowedPhoto(file: File) {
  if (!file || file.size === 0) return 'No file selected.';
  if (file.size > MAX_BYTES) return 'That photo is too large — keep it under 12MB.';
  if (!ALLOWED.has(file.type)) return 'Photos need to be JPEG, PNG, WEBP or HEIC.';
  return null;
}

/**
 * Where one shot lives.
 *
 * `date` is the day it belongs to — a `@db.Date` label at UTC midnight, the
 * same value that goes on the row — and it names the folder. The file itself
 * is named from the moment of upload plus a random suffix, which is the part
 * that has to be unique.
 *
 * Those used to be the same value, and `getTime()` on a day label is a
 * constant for the whole day: the path came out fully determined by client,
 * date and angle, so the second front shot of a day always collided with the
 * first. The upload is `upsert: false`, so Supabase returned "already
 * exists", the action returned on that error, and nothing happened — a client
 * who reshot a badly lit photo tapped Upload and watched the page not change.
 * The comment here claimed the opposite of what the code did.
 *
 * The random suffix sits on top of the timestamp because two uploads can land
 * in the same millisecond, and because a guessable object key is one fewer
 * layer of defence on the most sensitive bucket in the app. The sibling
 * helpers in meal-photos.ts and voice-notes.ts already take the moment from
 * `new Date()` rather than from a stored date; this one was the odd one out.
 */
export function photoPath(clientId: string, date: Date, angle: PhotoAngle, filename: string) {
  const ext = (filename.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const day = date.toISOString().slice(0, 10);
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  return `${clientId}/${day}/${angle}-${stamp}-${rand}.${ext}`;
}

export async function uploadPhoto(path: string, file: File) {
  const supabase = createAdminClient();
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  return error?.message ?? null;
}

export async function removePhoto(path: string) {
  const supabase = createAdminClient();
  await supabase.storage.from(PHOTO_BUCKET).remove([path]);
}

/**
 * Signs a batch of paths in one round trip. Links expire in an hour, which
 * outlives a page view without leaving a URL that keeps working if it leaks.
 */
export async function signPhotoUrls(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;

  const supabase = createAdminClient();
  const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600);

  for (const row of data ?? []) {
    if (row.signedUrl && row.path) out.set(row.path, row.signedUrl);
  }
  return out;
}

import { createAdminClient } from '@/lib/supabase/server';

/*
  A face on every account.

  `Profile.avatarUrl` has been in the schema since the first migration and
  nothing has ever written to it, so every avatar in the product is a pair of
  initials — the coach's inbox, his client list, the thread headers, all of it.
  Forty grey squares reading BO, AM, CL is a directory, not a roster, and the
  coach knows these people by face long before he knows them by name.

  Deliberately NOT the progress-photos bucket. Those are the most sensitive
  thing in this app: private, never a public URL, every read a short-lived
  signed link. An avatar is the opposite by intent — the person picked it to be
  seen — and routing it through the same machinery would mean signing forty
  URLs on every render of the client list. So: its own public bucket, and the
  two never mix.
*/

export const AVATAR_BUCKET = 'avatars';

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

/** Returns an error string a person can read, or null when the file is fine. */
export function isAllowedAvatar(file: File | null | undefined): string | null {
  if (!file || file.size === 0) return 'Pick a photo first.';
  if (file.size > MAX_BYTES) return 'That photo is too large — keep it under 8MB.';
  if (!ALLOWED.has(file.type)) return 'Photos need to be JPEG, PNG, WEBP or HEIC.';
  return null;
}

/**
 * One path per user, overwritten on change.
 *
 * No timestamp in the name, unlike progress photos, because there is no
 * history worth keeping here — a new avatar replaces the old one and the old
 * one is of no interest to anybody. The cache-buster rides on the URL instead.
 */
export function avatarPath(userId: string, filename: string) {
  const ext = (filename.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${userId}/avatar.${ext}`;
}

/** Uploads and returns the public URL, or an error string. */
export async function uploadAvatar(
  path: string,
  file: File
): Promise<{ url: string } | { error: string }> {
  const supabase = createAdminClient();

  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });
  if (error) return { error: error.message };

  const {
    data: { publicUrl },
  } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);

  /*
    A version query on the end.

    The path is stable so the browser and every CDN in front of it will happily
    serve the old picture for as long as they feel like. Changing your photo
    and still seeing the previous one is the kind of small broken thing that
    makes a product feel untended.
  */
  return { url: `${publicUrl}?v=${Date.now()}` };
}

export async function removeAvatar(path: string) {
  const supabase = createAdminClient();
  await supabase.storage.from(AVATAR_BUCKET).remove([path]);
}

/**
 * The stored URL, or null.
 *
 * Guarded rather than trusted: this value ends up in an `<img src>`, and the
 * column is old enough that nobody can say for certain what is in it. Anything
 * that isn't an http(s) URL is dropped — a `javascript:` or `data:` value
 * reaching an image tag is not a risk worth carrying for a profile picture.
 */
export function avatarSrc(profile: { avatarUrl?: string | null } | null | undefined) {
  const raw = profile?.avatarUrl?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:' ? raw : null;
  } catch {
    return null;
  }
}

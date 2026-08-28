import { createAdminClient } from '@/lib/supabase/server';

/*
  Voice messages.

  Coaching over text loses the two things that make a correction land: tone,
  and the ability to say a long thing quickly. "Your hips are shooting up
  before the bar leaves the floor, brace before you pull" is fifteen seconds
  of talking and a paragraph of typing, and the paragraph reads colder.

  Its own module rather than a shared one with meal-photos and avatars, for
  the same reason those two are separate from each other: the buckets differ
  in sensitivity and in how long their contents should live. A voice note is
  a conversation, not a record — closer to the message it is attached to than
  to a progress photo. When a fourth bucket shows up, that is the moment to
  extract the common part, not before.
*/

export const VOICE_NOTE_BUCKET = 'voice-notes';

/**
 * What sending a voice note reports back.
 *
 * The actions return this rather than void because the recorder holds the
 * only copy of the recording. An action that failed silently would leave the
 * caller deleting a take that never arrived, believing it had — the worst
 * outcome available, since the person has already said the thing out loud
 * and the person it was for never hears it.
 */
export type VoiceNoteResult = { error: string | null };

/*
  Four megabytes, not ten.

  A server action on Vercel is a serverless function with a hard request body
  limit around 4.5MB, enforced by the platform before any of this code runs.
  A larger ceiling here would be a promise the deployment cannot keep: the
  POST would be rejected with a 413 and the recording lost, with the app
  believing it had merely been "sent". The recorder stops itself at three
  minutes, which at the bitrate a phone browser picks lands comfortably
  inside this.
*/
const MAX_BYTES = 4 * 1024 * 1024;

/*
  MediaRecorder does not produce the same container everywhere: Chrome and
  Android give webm/opus, Safari and iOS give mp4/aac, and both append a
  codecs= parameter to the type. Matching on the family rather than an exact
  list is what stops an iPhone recording from being rejected as "not audio".
*/
export function isAllowedVoiceNote(file: File): string | null {
  if (!file || file.size === 0) return 'That recording came through empty.';
  if (file.size > MAX_BYTES) return 'That recording is too long — keep it under three minutes.';
  if (!file.type.toLowerCase().startsWith('audio/')) return 'That is not an audio recording.';
  return null;
}

/**
 * The type without its codecs parameter.
 *
 * Chrome hands back `audio/webm;codecs=opus` and Safari `audio/mp4;codecs=…`.
 * The bucket's allowed_mime_types list matches the type exactly, so uploading
 * the raw string would reject every real recording while a hand-made
 * `audio/webm` sailed through — the kind of failure that only appears on a
 * phone, never in a test.
 */
export function baseMimeType(mimeType: string): string {
  return mimeType.split(';')[0].trim().toLowerCase();
}

/** webm, mp4, ogg… derived from the type the recorder actually used. */
export function extensionFor(mimeType: string): string {
  const base = baseMimeType(mimeType);
  switch (base) {
    case 'audio/webm':
      return 'webm';
    case 'audio/ogg':
      return 'ogg';
    case 'audio/mp4':
    case 'audio/x-m4a':
      return 'm4a';
    case 'audio/mpeg':
      return 'mp3';
    case 'audio/wav':
    case 'audio/x-wav':
      return 'wav';
    default:
      return 'webm';
  }
}

export function voiceNotePath(senderId: string, mimeType: string) {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  // Timestamped, so a burst of notes in one conversation never collides.
  return `${senderId}/${day}/${now.getTime()}.${extensionFor(mimeType)}`;
}

export async function uploadVoiceNote(path: string, file: File) {
  const supabase = createAdminClient();
  const { error } = await supabase.storage
    .from(VOICE_NOTE_BUCKET)
    .upload(path, file, { contentType: baseMimeType(file.type), upsert: false });
  return error?.message ?? null;
}

export async function removeVoiceNote(path: string) {
  const supabase = createAdminClient();
  await supabase.storage.from(VOICE_NOTE_BUCKET).remove([path]);
}

/**
 * Signs a batch of paths in one round trip.
 *
 * The bucket is private. An hour outlives any thread view, and a link that
 * leaks stops working rather than staying good forever — which matters more
 * here than for a photo, because a voice note carries somebody's actual
 * voice saying something they meant for one person.
 */
export async function signVoiceNoteUrls(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const clean = paths.filter(Boolean);
  if (clean.length === 0) return out;

  const supabase = createAdminClient();
  const { data } = await supabase.storage.from(VOICE_NOTE_BUCKET).createSignedUrls(clean, 3600);

  for (const row of data ?? []) {
    if (row.signedUrl && row.path) out.set(row.path, row.signedUrl);
  }
  return out;
}

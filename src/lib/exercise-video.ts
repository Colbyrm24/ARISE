/*
  Exercise demo videos.

  The ExerciseVideo table has been in the schema since the beginning and has
  never held a row. It was designed around uploading and hosting files
  (storageProvider "supabase" | "mux"), which is the expensive version of this
  problem — transcoding, bandwidth, players.

  The version that works today is a link. A coach films a demo once, puts it
  wherever they already put video, and pastes the URL. That covers the actual
  need (a client who doesn't know what a Pendlay row looks like) at zero
  infrastructure cost, and it uses the same table — a hosted upload later is
  just another storageProvider, not a migration.
*/

export type VideoProvider = 'youtube' | 'vimeo' | 'url';

export type ParsedVideo = {
  provider: VideoProvider;
  /** Stored in ExerciseVideo.externalId. An id for known hosts, else the URL. */
  externalId: string;
  /** Where to send someone who wants to watch it. */
  watchUrl: string;
  /** Only known for hosts that publish a predictable thumbnail. */
  thumbnailUrl: string | null;
};

const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);
const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);
const VIDEO_EXT = /\.(mp4|mov|m4v|webm)$/i;

/**
 * Returns the parsed video, or null when the input isn't a usable video link.
 *
 * Deliberately strict about the scheme: this string ends up in an href, and
 * accepting anything that isn't http(s) would turn a coach-editable field into
 * a javascript: link waiting to happen.
 */
export function parseVideoUrl(raw: string): ParsedVideo | null {
  const input = raw.trim();
  if (!input) return null;

  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;

  const host = u.hostname.toLowerCase();

  if (YT_HOSTS.has(host)) {
    // youtu.be/<id>, /watch?v=<id>, /shorts/<id>, /embed/<id>
    let id = '';
    if (host === 'youtu.be') {
      id = u.pathname.slice(1);
    } else if (u.pathname === '/watch') {
      id = u.searchParams.get('v') ?? '';
    } else {
      const m = u.pathname.match(/^\/(?:shorts|embed|v)\/([^/?]+)/);
      id = m?.[1] ?? '';
    }
    id = id.split('/')[0];
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) return null;
    return {
      provider: 'youtube',
      externalId: id,
      watchUrl: `https://www.youtube.com/watch?v=${id}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    };
  }

  if (VIMEO_HOSTS.has(host)) {
    const m = u.pathname.match(/(\d{6,})/);
    if (!m) return null;
    return {
      provider: 'vimeo',
      externalId: m[1],
      watchUrl: `https://vimeo.com/${m[1]}`,
      // Vimeo thumbnails need an API call, which isn't worth a round trip here.
      thumbnailUrl: null,
    };
  }

  // A direct file is fine — a coach hosting their own clips shouldn't be
  // forced onto someone else's platform.
  if (VIDEO_EXT.test(u.pathname)) {
    return { provider: 'url', externalId: u.toString(), watchUrl: u.toString(), thumbnailUrl: null };
  }

  return null;
}

/** Rebuilds a watchable URL from what was stored, for any provider. */
export function watchUrlFor(storageProvider: string, externalId: string): string | null {
  switch (storageProvider) {
    case 'youtube':
      return `https://www.youtube.com/watch?v=${externalId}`;
    case 'vimeo':
      return `https://vimeo.com/${externalId}`;
    case 'url':
      return /^https?:\/\//i.test(externalId) ? externalId : null;
    default:
      // supabase / mux rows would need signing or a player; nothing writes
      // them yet, so don't pretend they're linkable.
      return null;
  }
}

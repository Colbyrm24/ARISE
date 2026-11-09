import { parseVideoUrl } from '@/lib/exercise-video';
import type { ClientResult, LandingContent, Testimonial } from '@/lib/landing-content';

/*
  The bits of the /coaching page that are decisions rather than markup, kept
  pure so they can be tested without rendering anything.
*/

export type LandingVideo =
  | { kind: 'youtube'; id: string; src: string }
  | { kind: 'vimeo'; id: string; src: string }
  | { kind: 'file'; src: string }
  | { kind: 'none' };

/**
 * The sales video, as something a player can embed.
 *
 * Every variant starts muted: browsers only allow autoplay with the sound
 * off, so the page autoplays silently and offers a tap to unmute. YouTube
 * and Vimeo get their JS APIs switched on so that tap can reach into the
 * iframe with postMessage — no player SDK loaded for it.
 *
 * Anything unrecognised (an empty string, a page link, a typo) is 'none',
 * and the page shows the placeholder frame rather than a broken player.
 */
export function landingVideo(raw: string): LandingVideo {
  const parsed = parseVideoUrl(raw ?? '');
  if (!parsed) return { kind: 'none' };
  if (parsed.provider === 'youtube') {
    const id = parsed.externalId;
    const q = new URLSearchParams({
      autoplay: '1',
      mute: '1',
      playsinline: '1',
      rel: '0',
      modestbranding: '1',
      enablejsapi: '1',
      // Looping a single video needs its own id as a playlist.
      loop: '1',
      playlist: id,
    });
    return { kind: 'youtube', id, src: `https://www.youtube-nocookie.com/embed/${id}?${q}` };
  }
  if (parsed.provider === 'vimeo') {
    const id = parsed.externalId;
    const q = new URLSearchParams({
      autoplay: '1',
      muted: '1',
      playsinline: '1',
      loop: '1',
      title: '0',
      byline: '0',
      portrait: '0',
      dnt: '1',
    });
    return { kind: 'vimeo', id, src: `https://player.vimeo.com/video/${id}?${q}` };
  }
  // Only real video files make it here; parseVideoUrl rejects anything else.
  return { kind: 'file', src: parsed.watchUrl };
}

export type ResultsView =
  | { mode: 'real'; items: ClientResult[] }
  | { mode: 'placeholder'; slots: number }
  | { mode: 'hidden' };

/** How many example slots fill the grid before any real results exist. */
export const PLACEHOLDER_SLOTS = 3;

/**
 * What the results section shows.
 *
 * Real results always win. With none, it's example slots or nothing, by the
 * coach's choice — never invented people. An entry missing its result line
 * or name is dropped rather than rendered half-empty next to real ones.
 */
export function resultsView(
  content: Pick<LandingContent, 'results' | 'showResultPlaceholders'>
): ResultsView {
  // A result counts once it has a picture to show; the words are optional.
  const items = content.results.filter(
    (r) => safeImage(r.photo) || (safeImage(r.beforePhoto) && safeImage(r.afterPhoto))
  );
  if (items.length > 0) return { mode: 'real', items };
  return content.showResultPlaceholders
    ? { mode: 'placeholder', slots: PLACEHOLDER_SLOTS }
    : { mode: 'hidden' };
}

/** Only links that can safely go in an <img src>: http(s) or a /public path. */
export function safeImage(src: string | null | undefined) {
  const v = (src ?? '').trim();
  if (!v) return null;
  if (v.startsWith('/') && !v.startsWith('//')) return v;
  return /^https?:\/\//i.test(v) ? v : null;
}

export type TestimonialsView =
  | { mode: 'real'; items: Testimonial[] }
  | { mode: 'placeholder'; slots: number }
  | { mode: 'hidden' };

/** Same rule as results: real ones win, else example slots or nothing. */
export function testimonialsView(
  content: Pick<LandingContent, 'testimonials' | 'showResultPlaceholders'>
): TestimonialsView {
  const items = content.testimonials.filter((t) => t.quote.trim() && t.name.trim());
  if (items.length > 0) return { mode: 'real', items };
  return content.showResultPlaceholders ? { mode: 'placeholder', slots: 3 } : { mode: 'hidden' };
}

/**
 * The coach's Calendly link with the applicant's name and email filled in,
 * so they don't type them twice. `embed` adds what Calendly's inline embed
 * expects. Returns '' for a link that isn't a real https Calendly URL.
 */
export function calendlyLink(base: string, name: string, email: string, opts: { embed?: boolean } = {}) {
  let url: URL;
  try {
    url = new URL(base.trim());
  } catch {
    return '';
  }
  if (url.protocol !== 'https:' || !/(^|\.)calendly\.com$/i.test(url.hostname)) return '';
  if (opts.embed) {
    url.searchParams.set('embed_type', 'Inline');
    url.searchParams.set('embed_domain', 'www.colbymullinscoaching.com');
  }
  url.searchParams.set('hide_gdpr_banner', '1');
  if (name.trim()) url.searchParams.set('name', name.trim());
  if (email.trim()) url.searchParams.set('email', email.trim());
  return url.toString();
}

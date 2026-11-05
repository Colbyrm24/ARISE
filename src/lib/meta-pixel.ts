/*
  Meta Pixel for the public coaching pages (/coaching and /coaching/apply).

  It runs on those two pages only, never inside the app, so nothing a client
  logs (weight, photos, meals, messages) can reach Meta. The privacy policy
  says exactly this — keep the two in step.

  A pixel ID is public by design (it ships in every page's HTML), so a
  committed default is fine; NEXT_PUBLIC_META_PIXEL_ID overrides it without a
  code change if the dataset is ever replaced.
*/

export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || '1463638105857356';

type Fbq = (...args: unknown[]) => void;

function fbq(): Fbq | null {
  if (typeof window === 'undefined') return null;
  const f = (window as unknown as { fbq?: Fbq }).fbq;
  return typeof f === 'function' ? f : null;
}

/**
 * Fire the events for a finished application. Never sends answers, names or
 * contact details — only that an application happened and whether it
 * qualified for a call, which is what Meta needs to learn who to find more of.
 *
 * Swallows every failure: an ad blocker or a pixel that never loaded must not
 * stand between someone and the confirmation screen.
 */
export function trackApplication(qualified: boolean) {
  const f = fbq();
  if (!f) return;
  try {
    f('track', 'Lead', { content_name: 'coaching_application' });
    f('track', 'SubmitApplication');
    if (qualified) f('trackCustom', 'QualifiedApplication');
  } catch {
    /* tracking is never worth an error */
  }
}

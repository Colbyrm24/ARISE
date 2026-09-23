/*
  Work that should not keep somebody waiting.

  Sending a message did five things and the person who tapped Send waited for
  all of them: the message row, a name lookup, a notification row, and then a
  web push to every device the recipient has ever registered. That last one is
  an HTTPS request to Apple's or Google's push service with no timeout on it,
  so the spinner on a phone in a gym was measuring somebody else's push
  infrastructure. The message itself is a single insert and is done in
  milliseconds.

  Only the message is worth waiting for. Everything after it is a nudge toward
  something already saved, so it goes here instead.

  On Vercel the platform hands each invocation a `waitUntil` through a global
  request context, which keeps the function alive until the work finishes
  while the response goes out immediately. That is the whole reason this is
  not just a floating promise: a detached promise can be frozen the instant
  the response is sent, which would silently stop push from ever arriving.

  Read off the global rather than imported from @vercel/functions so this
  needs no dependency and no build-time knowledge of where it is running.
  Anywhere without that context — local dev, a test — it falls back to
  running the work and swallowing failures, which is the behaviour these
  callers already had.
*/

type RequestContext = { waitUntil?: (promise: Promise<unknown>) => void };

function platformWaitUntil(): ((promise: Promise<unknown>) => void) | null {
  try {
    const store = (
      globalThis as unknown as {
        [key: symbol]: { get?: () => RequestContext | undefined } | undefined;
      }
    )[Symbol.for('@vercel/request-context')];

    const waitUntil = store?.get?.()?.waitUntil;
    return typeof waitUntil === 'function' ? waitUntil : null;
  } catch {
    return null;
  }
}

/**
 * Run `work` without holding up the response.
 *
 * Never throws and never rejects into the caller: everything sent here is by
 * definition something whose failure is survivable, and the one thing that is
 * not survivable — the record itself — was already awaited before this was
 * called.
 */
export function afterResponse(work: () => Promise<unknown>): void {
  const settled = (async () => {
    try {
      await work();
    } catch {
      // Same contract as the notify() it usually wraps: a nudge that fails
      // must never break the thing it was announcing.
    }
  })();

  const waitUntil = platformWaitUntil();
  if (waitUntil) {
    waitUntil(settled);
    return;
  }

  // No platform context. The promise is already running and already catches
  // its own failures; this marks it deliberate rather than forgotten.
  void settled;
}

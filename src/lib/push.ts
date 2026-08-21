import webpush from 'web-push';
import { prisma } from '@/lib/prisma';

/*
  Web push.

  This is the piece that makes ARISE reach a phone at all. Everything else in
  the app waits for the client to remember to open it.

  Worth being clear about the one real limitation: on iOS, web push only works
  once the app has been added to the home screen. Safari in a normal tab cannot
  receive it, no matter what we do here. That's an Apple constraint, not
  something the code can work around — which is why the opt-in control says so
  in plain language rather than failing silently.
*/

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? '';
const CONTACT = process.env.VAPID_SUBJECT ?? 'mailto:support@arise.coach';

let configured = false;

/** Push is optional infrastructure — without keys the app runs, just quieter. */
function ensureConfigured() {
  if (configured) return true;
  if (!PUBLIC_KEY || !PRIVATE_KEY) return false;
  webpush.setVapidDetails(CONTACT, PUBLIC_KEY, PRIVATE_KEY);
  configured = true;
  return true;
}

export function pushConfigured() {
  return Boolean(PUBLIC_KEY && PRIVATE_KEY);
}

export type PushPayload = {
  title: string;
  body: string;
  /** Where clicking it should land. Defaults to /today in the worker. */
  url?: string;
  /** Same tag replaces rather than stacks. */
  tag?: string;
};

/**
 * Sends to every device a user has registered.
 *
 * Never throws. Push is a side effect of something that already succeeded —
 * a message that saved, a check-in that was submitted — and a push failure
 * must not turn that into an error the user sees.
 *
 * Endpoints the push service reports as gone (404/410) are deleted, so the
 * table prunes itself instead of accumulating dead rows and retry cost.
 */
export async function sendPush(userId: string, payload: PushPayload): Promise<number> {
  if (!ensureConfigured()) return 0;

  let subs;
  try {
    subs = await prisma.pushSubscription.findMany({ where: { userId } });
  } catch {
    return 0;
  }
  if (subs.length === 0) return 0;

  const body = JSON.stringify(payload);
  const dead: string[] = [];
  let sent = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body
        );
        sent += 1;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) dead.push(sub.endpoint);
        // Anything else (a timeout, a 5xx from the push service) is left
        // alone — a transient failure shouldn't cost someone their device.
      }
    })
  );

  if (dead.length > 0) {
    try {
      await prisma.pushSubscription.deleteMany({ where: { endpoint: { in: dead } } });
    } catch {
      // Pruning is housekeeping; failing at it changes nothing for the user.
    }
  }

  return sent;
}

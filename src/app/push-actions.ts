'use server';

import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

/*
  Subscribe / unsubscribe for web push.

  Lives at the app root rather than under (client) because the coach wants
  these too — a message from a client at 6am is exactly the thing worth being
  interrupted for.
*/

export async function savePushSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: 'Not signed in.' };

  const { endpoint, p256dh, auth, userAgent } = input;
  if (!endpoint || !p256dh || !auth) return { ok: false as const, error: 'Incomplete subscription.' };
  // Endpoints are URLs from the browser's push service. Anything else is not
  // something we should be storing, let alone sending to later.
  if (!/^https:\/\//i.test(endpoint) || endpoint.length > 1000) {
    return { ok: false as const, error: 'Invalid subscription.' };
  }

  try {
    /*
      Upsert on endpoint: re-subscribing on a device we already know updates
      it rather than adding a duplicate that would ring twice.

      Rewriting `userId` here is deliberate, not an oversight. An endpoint is
      issued by the browser's push service to one browser profile, so holding
      one means being on that device — and when a device changes hands, or two
      people share a browser, the notifications should follow whoever is
      signed in now. Refusing the takeover would lock the second person out of
      push on their own machine forever, which is a real cost against an
      attack that requires already having the device.
    */
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId: user.id, endpoint, p256dh, auth, userAgent: userAgent?.slice(0, 300) },
      update: { userId: user.id, p256dh, auth, userAgent: userAgent?.slice(0, 300) },
    });
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: 'Could not save that. Try again.' };
  }
}

export async function deletePushSubscription(endpoint: string) {
  const user = await getCurrentUser();
  if (!user || !endpoint) return { ok: false as const };

  try {
    // Scoped to the caller so an endpoint can't be used to unsubscribe
    // somebody else's device.
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
    return { ok: true as const };
  } catch {
    return { ok: false as const };
  }
}

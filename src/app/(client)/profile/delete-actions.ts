'use server';

import { prisma } from '@/lib/prisma';
import { requireClient } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { eraseClientData, deleteAuthIdentity } from '@/lib/delete-account';
import { notifyCoach, displayName } from '@/lib/notifications';
import { stripe } from '@/lib/stripe';

/*
  The client-facing half of account deletion.

  Three things happen here that don't happen in lib/delete-account.ts, because
  they are about this being a person pressing a button rather than a data
  operation:

  1. The coach is told, BEFORE the data goes. Afterwards there is no name left
     to put in the message — the whole point of the erase is that there isn't —
     so the notification has to be written while the profile still exists.
  2. The session is ended. Otherwise the browser keeps a cookie for an identity
     that no longer exists, and every request spends a round trip discovering
     that again.
  3. A coach cannot do this to themselves. requireClient already refuses
     anybody whose role is coach, which is what keeps the one account the whole
     app hangs off from being deleted by a mis-click on a shared laptop.
*/

export type DeleteResult = { ok: true } | { ok: false; error: string };

/**
 * What the person is about to lose, so the confirmation can say it out loud.
 *
 * A dialog that says "this cannot be undone" is not informed consent; "this
 * deletes 240 logged meals and 18 progress photos" is. And the subscription
 * warning is the one that actually saves somebody money, because deleting an
 * account does not stop a Stripe charge and nothing about the interface would
 * suggest otherwise.
 */
export async function deletionPreview() {
  const user = await requireClient();

  const [meals, workouts, photos, weights, activeSub] = await Promise.all([
    prisma.nutritionLog.count({ where: { clientId: user.id } }),
    prisma.workoutLog.count({ where: { clientId: user.id } }),
    prisma.progressPhoto.count({ where: { clientId: user.id } }),
    prisma.weightLog.count({ where: { clientId: user.id } }),
    prisma.subscription.findFirst({
      where: {
        clientId: user.id,
        deletedAt: null,
        status: { in: ['active', 'past_due'] },
      },
      select: { id: true },
    }),
  ]);

  return {
    meals,
    workouts,
    photos,
    weights,
    hasActiveSubscription: Boolean(activeSub),
    // A Follow My Split member's subscription is cancelled by deleting — see
    // deleteMyAccount — so the warning about charges carrying on is not theirs.
    isMember: user.clientRecord?.tier === 'program',
  };
}

/**
 * Deletes the signed-in client's account.
 *
 * Takes the person's own email as typed confirmation. Not security — they are
 * already signed in, so it stops nothing an attacker would be stopped by. It
 * is there so that the irreversible thing takes a deliberate act rather than
 * one tap, which is the difference between a delete button and a trap.
 */
export async function deleteMyAccount(typedEmail: string): Promise<DeleteResult> {
  const user = await requireClient();

  if (typedEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
    return { ok: false, error: 'That email does not match the one on this account.' };
  }

  // Written now, while there is still a name to write.
  /*
    A Follow My Split member deleting their account means they are done — and
    unlike a coaching client there is nobody to "message to end coaching
    first". Leaving a $16.99 charge running against an account that no longer
    exists would bill somebody, possibly a teenager, for nothing. So it is
    cancelled at Stripe here, BEFORE the data goes: afterwards the subscription
    rows still exist but nothing is left to show them to. If Stripe refuses,
    nothing is deleted and they are told why.
  */
  if (user.clientRecord?.tier === 'program') {
    const subs = await prisma.subscription.findMany({
      where: {
        clientId: user.id,
        deletedAt: null,
        provider: 'stripe',
        providerSubscriptionId: { not: null },
        status: { notIn: ['canceled', 'completed'] },
      },
      select: { providerSubscriptionId: true },
    });
    try {
      for (const sub of subs) {
        await stripe.subscriptions.cancel(sub.providerSubscriptionId as string);
      }
    } catch (e) {
      console.error('[delete-account] could not cancel member subscription', e);
      return {
        ok: false,
        error:
          'Nothing was deleted — we could not cancel your subscription first. Try again in a minute, or cancel it from "Manage or cancel" above.',
      };
    }
  }

  const who = await displayName(user.id);
  try {
    await notifyCoach(
      user.id,
      'account',
      `${who} deleted their ARISE account. Their logs and messages are gone; billing records are kept.`
    );
  } catch {
    // Never let a notification failure block a deletion the person asked for.
  }

  try {
    await eraseClientData(user.id);
  } catch (e) {
    /*
      The transaction rolled back, so nothing was deleted and the account is
      intact. Say so — "something went wrong" after pressing Delete account
      leaves somebody with no idea whether their photos still exist.
    */
    console.error('[delete-account] erase failed', e);
    return {
      ok: false,
      error: 'Nothing was deleted — something went wrong on our end. Your account is unchanged. Please email and we will do it by hand.',
    };
  }

  // After the erase, on purpose: see deleteAuthIdentity.
  const authError = await deleteAuthIdentity(user.id);
  if (authError) console.error('[delete-account] auth identity survived', authError);

  try {
    await createClient().auth.signOut();
  } catch {
    // The identity is gone either way; the cookie is now worthless.
  }

  return { ok: true };
}

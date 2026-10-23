import { redirect } from 'next/navigation';
import { stripe } from '@/lib/stripe';
import { finalizeProgramSession, programMetaOf } from '@/lib/program-offer';

/*
  Where Stripe sends a new member after paying.

  The webhook does the same work, but it can arrive a few seconds after this
  page does — and somebody who just paid should land on today's workout, not
  on a screen telling them to wait. So this finalizes the session itself
  (idempotent, safe alongside the webhook) and then opens the app.
*/

export const dynamic = 'force-dynamic';

export default async function FollowWelcomePage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams?: { session_id?: string };
}) {
  const sessionId = searchParams?.session_id ?? '';

  if (sessionId.startsWith('cs_')) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (programMetaOf(session)) await finalizeProgramSession(session);
    } catch (err) {
      // The webhook will finish the job; the app's own gate sends them to the
      // right place in the meantime.
      console.error('Could not finalize a Follow My Split checkout on return', {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  redirect(`/today?joined=${encodeURIComponent(params.slug)}`);
}

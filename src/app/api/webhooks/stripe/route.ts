import { NextResponse, type NextRequest } from 'next/server';
import { stripe } from '@/lib/stripe';
import { finalizeStripeSession } from '@/lib/payment-finalize';
import {
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleSubscriptionChanged,
} from '@/lib/subscription-sync';

/**
 * Stripe calls this whenever money moves. Configure it in the Stripe
 * Dashboard → Developers → Webhooks → Add endpoint, pointing at
 * https://<your-domain>/api/webhooks/stripe. Stripe gives you a signing
 * secret at that point — that's STRIPE_WEBHOOK_SECRET in Vercel's
 * environment variables.
 *
 * Subscribe to all five of these:
 *
 *   checkout.session.completed      — signup: creates the agreement
 *   invoice.paid                    — every charge after signup
 *   invoice.payment_failed          — a declining card
 *   customer.subscription.updated   — status changes at Stripe
 *   customer.subscription.deleted   — cancelled, by either side
 *
 * Only the first was subscribed to originally, which is how a fixed
 * six-payment plan came to bill a client every month indefinitely: nothing
 * counted the payments, so nothing ever cancelled the subscription.
 *
 * The raw request body (not the parsed JSON) is required for signature
 * verification, which is why this reads request.text() instead of
 * request.json().
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid signature';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  /*
    Every handler below is idempotent, because Stripe retries a delivery it
    didn't get a 2xx for and will happily send the same event twice.

    A thrown error here means Stripe retries — which is what we want for a
    transient database blip, but not for a bug that will fail identically
    every time, since Stripe eventually gives up and the event is lost. So
    failures are logged and acknowledged rather than rethrown, and the
    payment count is always recomputed from the database, so a genuinely
    missed event still resolves correctly the next time one arrives.
  */
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as { id: string };
        await finalizeStripeSession(session.id);
        break;
      }

      // Every charge after signup. Without this, a recurring plan billed the
      // client each month and ARISE knew nothing about any of it.
      case 'invoice.paid': {
        await handleInvoicePaid(readInvoice(event.data.object));
        break;
      }

      // A declining card. The coach needs to know before the client does.
      case 'invoice.payment_failed': {
        await handleInvoicePaymentFailed(readInvoice(event.data.object));
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as {
          id: string;
          status: string;
          current_period_end?: number | null;
          cancel_at_period_end?: boolean | null;
        };
        const deleted = event.type === 'customer.subscription.deleted';
        await handleSubscriptionChanged({
          id: sub.id,
          status: deleted ? 'canceled' : sub.status,
          current_period_end: sub.current_period_end ?? null,
          // A subscription that has actually ended is no longer waiting to
          // end, so the scheduled flag has to come back down with it.
          cancel_at_period_end: deleted ? false : sub.cancel_at_period_end ?? null,
        });
        break;
      }
    }
  } catch (err) {
    console.error('Stripe webhook handler failed', {
      type: event.type,
      id: event.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({ received: true });
}

/**
 * Stripe types `invoice.subscription` as a string or an expanded object
 * depending on the API version and what was expanded at creation. Reading it
 * defensively here keeps that shape out of the handlers.
 */
function readInvoice(object: unknown) {
  const invoice = object as {
    id: string;
    subscription?: string | { id: string } | null;
    amount_paid?: number | null;
    amount_due?: number | null;
    billing_reason?: string | null;
    created?: number | null;
  };

  const subscription =
    typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription?.id ?? null;

  return {
    id: invoice.id,
    subscription,
    amount_paid: invoice.amount_paid ?? null,
    amount_due: invoice.amount_due ?? null,
    billing_reason: invoice.billing_reason ?? null,
    created: invoice.created ?? null,
  };
}

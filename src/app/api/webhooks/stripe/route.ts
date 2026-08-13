import { NextResponse, type NextRequest } from 'next/server';
import { stripe } from '@/lib/stripe';
import { finalizeStripeSession } from '@/lib/payment-finalize';

/**
 * Stripe calls this the moment a checkout completes. Configure it in the
 * Stripe Dashboard → Developers → Webhooks → Add endpoint, pointing at
 * https://<your-domain>/api/webhooks/stripe, listening for
 * checkout.session.completed. Stripe gives you a signing secret at that
 * point — that's STRIPE_WEBHOOK_SECRET in Vercel's environment variables.
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

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as { id: string };
    await finalizeStripeSession(session.id);
  }

  return NextResponse.json({ received: true });
}

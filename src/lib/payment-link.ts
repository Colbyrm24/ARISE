import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { getSiteUrl } from '@/lib/site-url';
import type { PaymentFrequency, Plan } from '@prisma/client';

/*
  Making the thing a client actually pays.

  This was inline in the coach's server action, which was fine while the only
  way to start a funnel was the coach pressing a button next to an existing
  client. It isn't any more: a client arriving on a join link needs the same
  Stripe object, the same PaymentLink row and the same expiry behaviour, and
  the one thing that must never happen is two subtly different versions of
  "create the payment" drifting apart — one of them would eventually take
  money without writing the row that turns it into an agreement.

  So the money lives here, once, and both callers hand it the same arguments.
  Authorisation is deliberately NOT here: the coach action proves ownership
  and the join route proves the invite, and each is the only one that can.
*/

const FREQUENCY_TO_INTERVAL: Record<
  Exclude<PaymentFrequency, 'one_time'>,
  { interval: 'week' | 'month'; interval_count: number }
> = {
  weekly: { interval: 'week', interval_count: 1 },
  biweekly: { interval: 'week', interval_count: 2 },
  monthly: { interval: 'month', interval_count: 1 },
};

export type LinkTerms = {
  clientId: string;
  plan: Plan;
  agreementTemplateId: string;
  startDate: Date;
  priceOverride: number | null;
  termMonthsOverride: number | null;
  numberOfPaymentsOverride: number | null;
};

/**
 * A plan backed by a real Stripe price cannot have its amount overridden.
 *
 * Stripe charges whatever that price says. If the override were honoured the
 * agreement would render "$450.00, billed monthly" over a signature line
 * while Stripe quietly took $300 forever — a signed document disagreeing
 * with the money.
 */
export function appliedPrice(plan: Plan, priceOverride: number | null) {
  const usesStripePrice = Boolean(plan.stripePriceId);
  const applied = usesStripePrice ? null : priceOverride;
  return { applied, effective: applied ?? Number(plan.price) };
}

/**
 * Creates the Stripe object and the PaymentLink row that ties an eventual
 * payment back to this client, plan and agreement template.
 *
 * Returns null rather than throwing when Stripe refuses — both callers are
 * rendering a page and a stack trace helps nobody standing in front of one.
 */
export async function createStripePaymentLink(terms: LinkTerms) {
  const { clientId, plan, agreementTemplateId, startDate } = terms;
  const { applied, effective } = appliedPrice(plan, terms.priceOverride);
  if (!Number.isFinite(effective) || effective <= 0) return null;

  const origin = getSiteUrl();
  const isRecurring =
    plan.billingType !== 'one_time' && plan.paymentFrequency && plan.paymentFrequency !== 'one_time';
  const successUrl = `${origin}/agreement/complete?session_id={CHECKOUT_SESSION_ID}`;

  // Informational only on Stripe's side. The count that actually stops a
  // fixed plan lives on the PaymentLink and is enforced from the invoice
  // webhooks by lib/subscription-sync.ts.
  const agreedPayments = String(terms.numberOfPaymentsOverride ?? plan.numberOfPayments ?? '');
  const fixedPlanMetadata =
    isRecurring && plan.billingType === 'payment_plan'
      ? { subscription_data: { metadata: { numberOfPayments: agreedPayments } } }
      : {};

  let checkoutUrl: string;
  let providerRef: string;

  if (plan.stripePriceId) {
    /*
      A Payment Link, not a Checkout Session.

      A Checkout Session expires 24 hours after it is created — Stripe's
      limit, not a setting. A Payment Link does not expire; it is restricted
      to a single completed checkout instead, so it stays good until the
      person it was sent to actually uses it and cannot be forwarded around
      and paid twice.
    */
    try {
      const link = await stripe.paymentLinks.create({
        line_items: [{ price: plan.stripePriceId, quantity: 1 }],
        after_completion: { type: 'redirect', redirect: { url: successUrl } },
        restrictions: { completed_sessions: { limit: 1 } },
        metadata: { clientId, planId: plan.id },
        ...fixedPlanMetadata,
      });
      checkoutUrl = link.url;
      providerRef = link.id;
    } catch (err) {
      console.error('Stripe refused to create a payment link', {
        clientId,
        planId: plan.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  } else {
    /*
      A plan priced by hand in ARISE has no Price at Stripe to point a
      Payment Link at, so it goes through a Checkout Session and expires
      after 24 hours. Importing the price on the payments screen is what
      upgrades a plan to a link that keeps.
    */
    try {
      const session = await stripe.checkout.sessions.create({
        mode: isRecurring ? 'subscription' : 'payment',
        line_items: [
          {
            price_data: {
              currency: 'usd',
              unit_amount: Math.round(effective * 100),
              product_data: { name: plan.name },
              ...(isRecurring
                ? {
                    recurring:
                      FREQUENCY_TO_INTERVAL[
                        plan.paymentFrequency as Exclude<PaymentFrequency, 'one_time'>
                      ],
                  }
                : {}),
            },
            quantity: 1,
          },
        ],
        ...fixedPlanMetadata,
        success_url: successUrl,
        cancel_url: `${origin}/welcome`,
        metadata: { clientId, planId: plan.id },
      });
      if (!session.url) return null;
      checkoutUrl = session.url;
      providerRef = session.id;
    } catch (err) {
      console.error('Stripe refused to create a checkout session', {
        clientId,
        planId: plan.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  const row = await prisma.paymentLink.create({
    data: {
      clientId,
      planId: plan.id,
      agreementTemplateId,
      provider: 'stripe',
      priceOverride: applied,
      termMonthsOverride: terms.termMonthsOverride,
      numberOfPaymentsOverride: terms.numberOfPaymentsOverride,
      startDate,
      checkoutUrl,
      providerRef,
    },
  });

  return { id: row.id, checkoutUrl, providerRef };
}

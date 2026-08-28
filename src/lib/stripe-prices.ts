import { stripe } from '@/lib/stripe';
import type { BillingType, PaymentFrequency } from '@prisma/client';

/*
  Your Stripe prices, as ARISE plans.

  Before this, generating a link built a brand new `price_data` object on the
  fly from a Plan row typed into ARISE. That works, but it means the number
  ARISE thinks a client is paying and the number Stripe actually charges are
  two separate facts that only agree while somebody keeps them in sync — and
  every link created a throwaway product in the Stripe dashboard, so the
  revenue reporting there had nothing stable to group by.

  Now a plan can point at a real Price you already created in Stripe. The
  checkout session names that price id, so the amount, the currency and the
  billing interval come from Stripe itself and cannot drift.
*/

/** A Stripe price ARISE can sell as-is. */
export type ImportableStripePrice = {
  supported: true;
  id: string;
  productId: string;
  /** Product name, plus the price's nickname when it has one. */
  name: string;
  /** Dollars, not cents — what goes in Plan.price. */
  amount: number;
  billingType: BillingType;
  paymentFrequency: PaymentFrequency | null;
};

/** A Stripe price ARISE will not import, and the reason shown to the coach. */
export type UnsupportedStripePrice = {
  supported: false;
  id: string;
  name: string;
  reason: string;
};

export type ClassifiedStripePrice = ImportableStripePrice | UnsupportedStripePrice;

/**
 * The shape this module needs off a Stripe price. Declared structurally so
 * the classifier can be tested without constructing a whole Stripe.Price.
 */
export type StripePriceLike = {
  id: string;
  nickname?: string | null;
  currency?: string | null;
  unit_amount?: number | null;
  billing_scheme?: string | null;
  recurring?: { interval?: string | null; interval_count?: number | null; usage_type?: string | null } | null;
  product?: string | { id: string; name?: string | null; deleted?: boolean } | null;
};

/**
 * Stripe describes recurrence as an interval plus a count; ARISE's agreement
 * language only knows weekly, every two weeks, and monthly. Anything else
 * (yearly, quarterly, daily) has no sentence to render into
 * {{payment_structure}}, so it is refused at import rather than signed for
 * in words that do not match what Stripe will charge.
 */
export function frequencyFromInterval(
  interval: string | null | undefined,
  count: number | null | undefined
): PaymentFrequency | null {
  const n = count ?? 1;
  if (interval === 'week' && n === 1) return 'weekly';
  if (interval === 'week' && n === 2) return 'biweekly';
  if (interval === 'month' && n === 1) return 'monthly';
  return null;
}

function productOf(price: StripePriceLike) {
  const p = price.product;
  if (!p) return { id: '', name: '' };
  if (typeof p === 'string') return { id: p, name: '' };
  return { id: p.id, name: p.name ?? '' };
}

/** Human label for a price: the product, plus the nickname when there is one. */
function labelFor(price: StripePriceLike) {
  const product = productOf(price).name.trim();
  const nickname = (price.nickname ?? '').trim();
  if (product && nickname) return `${product} — ${nickname}`;
  return product || nickname || price.id;
}

/**
 * Decides whether a Stripe price can become an ARISE plan, and what kind.
 * Pure — no network — so the rules are testable and the same rules run on
 * the listing screen and again at import time.
 */
export function classifyStripePrice(price: StripePriceLike): ClassifiedStripePrice {
  const name = labelFor(price);
  const refuse = (reason: string): UnsupportedStripePrice => ({
    supported: false,
    id: price.id,
    name,
    reason,
  });

  const product = productOf(price);
  if (typeof price.product === 'object' && price.product?.deleted) {
    return refuse('Its product was deleted in Stripe.');
  }

  // ARISE formats every figure as US dollars — on the plan list, in the
  // agreement, and on the client's billing card. Importing a price in
  // another currency would render "$300.00" next to a charge in euros.
  if ((price.currency ?? 'usd') !== 'usd') {
    return refuse(`Priced in ${(price.currency ?? '').toUpperCase()}, and ARISE only shows USD.`);
  }

  // Tiered and metered prices have no single amount to write on an
  // agreement, which is a document about one agreed number.
  if (price.billing_scheme && price.billing_scheme !== 'per_unit') {
    return refuse('Tiered pricing has no single amount to put on an agreement.');
  }
  if (price.recurring?.usage_type === 'metered') {
    return refuse('Metered pricing has no fixed amount to put on an agreement.');
  }
  if (price.unit_amount === null || price.unit_amount === undefined) {
    return refuse('No fixed amount set on this price.');
  }

  if (!price.recurring) {
    return {
      supported: true,
      id: price.id,
      productId: product.id,
      name,
      amount: price.unit_amount / 100,
      billingType: 'one_time',
      paymentFrequency: null,
    };
  }

  const paymentFrequency = frequencyFromInterval(
    price.recurring.interval,
    price.recurring.interval_count
  );
  if (!paymentFrequency) {
    const every = price.recurring.interval_count ?? 1;
    return refuse(
      `Bills every ${every} ${price.recurring.interval}${every === 1 ? '' : 's'} — ARISE agreements only describe weekly, every two weeks, and monthly.`
    );
  }

  return {
    supported: true,
    id: price.id,
    productId: product.id,
    name,
    amount: price.unit_amount / 100,
    // Ongoing by default. A client who agreed to a fixed number of payments
    // gets that count set on their own payment link, which is what actually
    // stops the billing — see lib/subscription-sync.ts.
    billingType: 'subscription',
    paymentFrequency,
  };
}

/**
 * Every active price in the connected Stripe account, already classified.
 *
 * Sorted so the sellable ones come first and the refused ones sit under them
 * with their reason, rather than vanishing and leaving the coach wondering
 * why the price he is looking at in Stripe is not on this screen.
 */
export async function listStripePrices(): Promise<ClassifiedStripePrice[]> {
  const prices = await stripe.prices
    .list({ active: true, limit: 100, expand: ['data.product'] })
    .autoPagingToArray({ limit: 300 });

  const classified = prices.map((price) => classifyStripePrice(price as StripePriceLike));

  return classified.sort((a, b) => {
    if (a.supported !== b.supported) return a.supported ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

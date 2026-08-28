'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { classifyStripePrice, listStripePrices, type StripePriceLike } from '@/lib/stripe-prices';

/** What a plan's agreement runs for when Stripe has not been asked. */
const DEFAULT_TERM_MONTHS = 12;

/**
 * Turns one Stripe price into an ARISE plan.
 *
 * The price is re-read from Stripe by id rather than trusted from the form.
 * Every 'use server' export is a public endpoint, and the amount that lands
 * on the plan is the amount that gets printed on a binding agreement — so it
 * comes from Stripe, not from whatever the browser posted.
 */
export async function importStripePrice(formData: FormData) {
  await requireCoach();

  const priceId = (formData.get('priceId') as string | null)?.trim();
  if (!priceId) return;

  const termRaw = formData.get('termMonths') as string | null;
  const parsedTerm = termRaw ? Number(termRaw) : NaN;
  const termMonths =
    Number.isInteger(parsedTerm) && parsedTerm > 0 ? parsedTerm : DEFAULT_TERM_MONTHS;

  let price;
  try {
    price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
  } catch (err) {
    console.error('Stripe would not return that price', {
      priceId,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  await upsertPlanFromPrice(price as StripePriceLike, termMonths);
  revalidatePath('/coach/payments');
}

/**
 * Imports every sellable active price in the Stripe account in one go, and
 * refreshes the ones already imported. This is the button to press after
 * adding a price in Stripe — nothing has to be re-typed into ARISE.
 *
 * Prices ARISE cannot describe on an agreement are skipped, not guessed at;
 * the payments screen lists them with the reason.
 */
export async function syncStripePrices() {
  await requireCoach();

  let prices;
  try {
    prices = await listStripePrices();
  } catch (err) {
    console.error('Could not read prices from Stripe', {
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  for (const price of prices) {
    if (!price.supported) continue;

    // Keep whatever term this plan was already given — the coach may have
    // set 6 months on it by hand, and a re-sync is about the money, not
    // about resetting his agreement lengths.
    const existing = await prisma.plan.findUnique({
      where: { stripePriceId: price.id },
      select: { termMonths: true },
    });

    await prisma.plan.upsert({
      where: { stripePriceId: price.id },
      create: {
        name: price.name,
        price: price.amount,
        billingType: price.billingType,
        paymentFrequency: price.paymentFrequency,
        numberOfPayments: null,
        termMonths: existing?.termMonths ?? DEFAULT_TERM_MONTHS,
        defaultProvider: 'stripe',
        stripePriceId: price.id,
        stripeProductId: price.productId || null,
        active: true,
      },
      update: {
        name: price.name,
        price: price.amount,
        billingType: price.billingType,
        paymentFrequency: price.paymentFrequency,
        stripeProductId: price.productId || null,
        active: true,
      },
    });
  }

  revalidatePath('/coach/payments');
}

/** Shared by the single import and the sync-all path. */
async function upsertPlanFromPrice(raw: StripePriceLike, termMonths: number) {
  const price = classifyStripePrice(raw);
  if (!price.supported) {
    console.warn('Refused to import a Stripe price', { priceId: price.id, reason: price.reason });
    return;
  }

  await prisma.plan.upsert({
    where: { stripePriceId: price.id },
    create: {
      name: price.name,
      price: price.amount,
      billingType: price.billingType,
      paymentFrequency: price.paymentFrequency,
      numberOfPayments: null,
      termMonths,
      defaultProvider: 'stripe',
      stripePriceId: price.id,
      stripeProductId: price.productId || null,
      active: true,
    },
    update: {
      name: price.name,
      price: price.amount,
      billingType: price.billingType,
      paymentFrequency: price.paymentFrequency,
      stripeProductId: price.productId || null,
      termMonths,
      active: true,
    },
  });
}

/**
 * The agreement length for a plan. Imported plans land on a default, because
 * Stripe has no concept of "this coaching engagement runs six months" — that
 * is ARISE's number, and it is what {{term_months}} renders on the contract.
 */
export async function updatePlanTerm(formData: FormData) {
  await requireCoach();

  const planId = (formData.get('planId') as string | null)?.trim();
  const raw = formData.get('termMonths') as string | null;
  const termMonths = raw ? Number(raw) : NaN;
  if (!planId || !Number.isInteger(termMonths) || termMonths <= 0) return;

  await prisma.plan.update({ where: { id: planId }, data: { termMonths } });
  revalidatePath('/coach/payments');
}

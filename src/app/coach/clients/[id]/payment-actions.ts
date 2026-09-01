'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireCoach, isEntitled } from '@/lib/auth';
import { coachOwnsClient } from '@/lib/coach-guard';
import { stripe } from '@/lib/stripe';
import { appliedPrice, createStripePaymentLink } from '@/lib/payment-link';
import { finalizeManualPaymentLink, recheckStripePaymentLink } from '@/lib/payment-finalize';
import { parsePrice, parseCount } from '@/lib/billing';
import type { PaymentFrequency, PaymentProviderType } from '@prisma/client';

/**
 * Generates the payment link a coach sends a client: creates a Stripe
 * Checkout Session (or, for FanBasis, tracks a manually-created link — see
 * the note on the form) and a PaymentLink row so the eventual webhook
 * knows exactly which client, plan, and agreement template it belongs to.
 */
export async function createPaymentLink(formData: FormData) {
  const coach = await requireCoach();

  const clientId = formData.get('clientId') as string | null;
  const planId = formData.get('planId') as string | null;
  const agreementTemplateId = formData.get('agreementTemplateId') as string | null;
  const provider = formData.get('provider') as PaymentProviderType | null;
  const startDateRaw = formData.get('startDate') as string | null;
  const priceOverrideRaw = formData.get('priceOverride') as string | null;
  const termMonthsOverrideRaw = formData.get('termMonthsOverride') as string | null;
  const numberOfPaymentsOverrideRaw = formData.get('numberOfPaymentsOverride') as string | null;
  const manualCheckoutUrl = (formData.get('manualCheckoutUrl') as string | null)?.trim();

  if (!clientId || !planId || !agreementTemplateId || !provider || !startDateRaw) return;
  if (!(await coachOwnsClient(coach.id, clientId))) return;

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) return;

  const startDate = new Date(startDateRaw);
  if (Number.isNaN(startDate.getTime())) return;

  /*
    These used to be `raw ? Number(raw) : null`, which turns "abc" into NaN
    rather than null — and `?? Number(plan.price)` doesn't catch NaN, only
    null. So a typo in the price box travelled all the way into
    `unit_amount: Math.round(NaN * 100)` inside the Stripe call, which 500s
    the page the coach is standing on with no hint as to which field did it.
  */
  const priceOverride = parsePrice(priceOverrideRaw);
  const termMonthsOverride = parseCount(termMonthsOverrideRaw);
  // How many payments this client agreed to, when it differs from the plan's
  // default. This is what decides when their subscription stops, so it is
  // stored on the link rather than living only in Stripe's metadata.
  const numberOfPaymentsOverride = parseCount(numberOfPaymentsOverrideRaw);
  /*
    The rule about Stripe-priced plans ignoring the override lives with the
    money, in @/lib/payment-link. This is only the sanity check that we have
    a number worth charging at all.
  */
  const { effective } = appliedPrice(plan, priceOverride);
  if (provider === 'stripe' && (!Number.isFinite(effective) || effective <= 0)) return;

  if (provider === 'stripe') {
    /*
      The Stripe half lives in @/lib/payment-link, because the join link
      needs the identical thing. Two copies of "create the payment" would
      eventually drift, and the drift would be one of them taking money
      without writing the row that turns it into an agreement.
    */
    const link = await createStripePaymentLink({
      clientId,
      plan,
      agreementTemplateId,
      startDate,
      priceOverride,
      termMonthsOverride,
      numberOfPaymentsOverride,
    });
    if (!link) return;
  } else {
    // FanBasis: no live API integration yet, so the coach pastes the
    // checkout link they generated directly in FanBasis. ARISE still
    // tracks it and lets the coach confirm payment by hand once it lands.
    if (!manualCheckoutUrl) return;

    await prisma.paymentLink.create({
      data: {
        clientId,
        planId,
        agreementTemplateId,
        provider,
        priceOverride,
        termMonthsOverride,
        numberOfPaymentsOverride,
        startDate,
        checkoutUrl: manualCheckoutUrl,
        providerRef: `manual-${Date.now()}`,
      },
    });
  }

  /*
    Move them to payment_pending only if they haven't bought yet.

    This used to be unconditional, and `payment_pending` is below the
    entitlement line — so generating a link for somebody who was already
    active silently revoked their access to the entire app. The coach saw
    nothing; the client opened ARISE that evening and got the waiting-room
    screen telling them to check their email for a payment link, with their
    program, their meals and their history all gone.

    Sending a renewal or a second-term link to a client mid-engagement is a
    completely ordinary thing to do, so the old behaviour was a live trap.
    A link for someone already being coached is now just a link.
  */
  const existing = await prisma.client.findUnique({
    where: { userId: clientId },
    select: { status: true },
  });

  if (existing && !isEntitled(existing.status)) {
    await prisma.client.update({
      where: { userId: clientId },
      data: { status: 'payment_pending' },
    });
  }

  revalidatePath(`/coach/clients/${clientId}`);
}

/**
 * Take a payment link out of circulation.
 *
 * There was no way to do this, and the gap showed: a link the coach had
 * changed his mind about stayed payable forever, and because the account
 * screen only ever showed the newest pending one, a stale link also blocked
 * the view of anything he made afterwards. Two live links for one client is
 * also two ways to be charged.
 *
 * Cancelled at Stripe as well as locally where we can. A Payment Link is
 * deactivated; a Checkout Session is expired. Either can fail harmlessly —
 * an already-dead session is the outcome we wanted — so a Stripe error never
 * stops the local row being closed.
 */
export async function cancelPaymentLink(formData: FormData) {
  const coach = await requireCoach();

  const paymentLinkId = formData.get('paymentLinkId') as string | null;
  const clientId = formData.get('clientId') as string | null;
  if (!paymentLinkId || !clientId) return;

  const link = await prisma.paymentLink.findFirst({
    where: { id: paymentLinkId, clientId, status: 'pending' },
  });
  if (!link) return;
  if (!(await coachOwnsClient(coach.id, link.clientId))) return;

  if (link.provider === 'stripe' && link.providerRef) {
    try {
      if (link.providerRef.startsWith('plink_')) {
        await stripe.paymentLinks.update(link.providerRef, { active: false });
      } else if (link.providerRef.startsWith('cs_')) {
        await stripe.checkout.sessions.expire(link.providerRef);
      }
    } catch (err) {
      console.error('Could not cancel the link at Stripe', {
        paymentLinkId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await prisma.paymentLink.update({
    where: { id: link.id },
    data: { status: 'cancelled' },
  });

  revalidatePath(`/coach/clients/${clientId}`);
}

/** Coach-confirmed payment for providers without a live webhook yet. */
export async function markPaymentLinkPaid(formData: FormData) {
  const coach = await requireCoach();

  const paymentLinkId = formData.get('paymentLinkId') as string | null;
  const clientId = formData.get('clientId') as string | null;
  if (!paymentLinkId || !clientId) return;

  /*
    The guard used to check `clientId` while everything downstream keyed off
    `paymentLink.clientId` — two ids on one form, and the checked one wasn't
    the one that acted. Submitting your own client next to somebody else's
    pending link passed the check and then, on THEIR client, marked the link
    paid, wrote a succeeded Payment for the full plan price with no money
    moved, created a binding agreement, and pushed them to agreement_pending.

    So the link is resolved first and its own owner is what gets checked.
  */
  const link = await prisma.paymentLink.findUnique({
    where: { id: paymentLinkId },
    select: { clientId: true },
  });
  if (!link || link.clientId !== clientId) return;
  if (!(await coachOwnsClient(coach.id, link.clientId))) return;

  await finalizeManualPaymentLink(paymentLinkId);

  revalidatePath(`/coach/clients/${clientId}`);
}

/**
 * "They say they paid — check Stripe."
 *
 * The recovery for a payment that landed at Stripe but never came back: a
 * webhook that did not arrive, or a client who closed the tab before the
 * success page could finish the job. Same ownership check as marking a link
 * paid, but the answer comes from Stripe rather than from the coach, so this
 * can only ever confirm a real payment.
 */
export async function recheckPaymentLink(formData: FormData) {
  const coach = await requireCoach();

  const paymentLinkId = formData.get('paymentLinkId') as string | null;
  const clientId = formData.get('clientId') as string | null;
  if (!paymentLinkId || !clientId) return;

  const link = await prisma.paymentLink.findUnique({
    where: { id: paymentLinkId },
    select: { clientId: true },
  });
  if (!link || link.clientId !== clientId) return;
  if (!(await coachOwnsClient(coach.id, link.clientId))) return;

  try {
    await recheckStripePaymentLink(paymentLinkId);
  } catch {
    // Stripe being unreachable is not worth a crash on a page the coach is
    // using to fix something else. The link stays pending and he can retry.
  }

  revalidatePath(`/coach/clients/${clientId}`);
}

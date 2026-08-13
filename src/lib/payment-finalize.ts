import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { renderAgreementTemplate, formatAgreementDate } from '@/lib/agreement';
import { describePaymentStructure } from '@/lib/plans';
import type { PaymentLink, Plan, AgreementTemplate } from '@prisma/client';

type PaymentLinkWithRelations = PaymentLink & { plan: Plan; template: AgreementTemplate };

/**
 * The shared tail end of "a payment just happened": mark the link paid,
 * record the Payment, render + create the Agreement, and bump the client
 * to agreement_pending. Shared by both the Stripe path (verified against
 * Stripe directly) and the FanBasis manual path (coach confirms by hand
 * until FanBasis's own webhook/API is wired up) so the two providers never
 * drift into behaving differently downstream of "money arrived."
 */
async function createAgreementAndPayment(
  paymentLink: PaymentLinkWithRelations,
  providerPaymentId: string
) {
  const price = Number(paymentLink.priceOverride ?? paymentLink.plan.price);
  const paymentFrequency = paymentLink.paymentFrequencyOverride ?? paymentLink.plan.paymentFrequency;
  const numberOfPayments = paymentLink.numberOfPaymentsOverride ?? paymentLink.plan.numberOfPayments;
  const termMonths = paymentLink.termMonthsOverride ?? paymentLink.plan.termMonths;

  const client = await prisma.client.findUnique({
    where: { userId: paymentLink.clientId },
    include: { user: { include: { profile: true } } },
  });
  if (!client) return null;

  const coach = await prisma.user.findFirst({ where: { role: 'coach' }, include: { profile: true } });

  // {{price}} is just the raw dollar figure; {{payment_structure}} is the
  // full plain-English billing description (frequency, number of
  // payments, etc). Templates can use either or both — keeping them
  // separate avoids a template reading "$1.00, billed $1.00 per payment,
  // 1 payments monthly" when both tokens appear in the same sentence.
  const formattedPrice = `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const paymentStructure = describePaymentStructure({
    price,
    billingType: paymentLink.plan.billingType,
    paymentFrequency,
    numberOfPayments,
  });

  const renderedText = renderAgreementTemplate(paymentLink.template.body, {
    client_name: client.user.profile?.fullName ?? client.user.email,
    coach_name: coach?.profile?.fullName ?? 'Your Coach',
    price: formattedPrice,
    payment_structure: paymentStructure,
    start_date: formatAgreementDate(paymentLink.startDate),
    term_months: String(termMonths),
    // signed_date intentionally left as a literal placeholder — filled in
    // by the sign action, at the moment the client actually signs.
  });

  const [, , agreement] = await prisma.$transaction([
    prisma.paymentLink.update({ where: { id: paymentLink.id }, data: { status: 'paid' } }),
    prisma.payment.create({
      data: {
        clientId: paymentLink.clientId,
        paymentLinkId: paymentLink.id,
        provider: paymentLink.provider,
        providerPaymentId,
        amount: price,
        status: 'succeeded',
        paidAt: new Date(),
      },
    }),
    prisma.agreement.create({
      data: {
        clientId: paymentLink.clientId,
        paymentLinkId: paymentLink.id,
        templateId: paymentLink.template.id,
        templateVersion: paymentLink.template.version,
        renderedText,
        planId: paymentLink.planId,
        price,
        paymentFrequency,
        numberOfPayments,
        startDate: paymentLink.startDate,
        termMonths,
      },
    }),
    prisma.client.update({
      where: { userId: paymentLink.clientId },
      data: { status: 'agreement_pending', startDate: paymentLink.startDate },
    }),
  ]);

  return agreement;
}

/**
 * Turns a paid Stripe Checkout Session into a finalized agreement. Called
 * from two places on purpose: the Stripe webhook (the real, reliable path)
 * and the checkout success page the client lands on (a fallback, since
 * webhook delivery can lag a second or two, or — before the webhook
 * endpoint is configured in the Stripe dashboard — not fire at all yet).
 * Idempotent: if the PaymentLink is already marked paid, this just returns
 * the existing Agreement instead of creating a second one.
 */
export async function finalizeStripeSession(sessionId: string) {
  const paymentLink = await prisma.paymentLink.findFirst({
    where: { providerRef: sessionId },
    include: { plan: true, template: true },
  });
  if (!paymentLink) return null;

  if (paymentLink.status === 'paid') {
    return prisma.agreement.findUnique({ where: { paymentLinkId: paymentLink.id } });
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== 'paid') return null;

  const providerPaymentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.id;

  return createAgreementAndPayment(paymentLink, providerPaymentId);
}

/**
 * FanBasis doesn't yet have a wired-up webhook/API integration in ARISE
 * (see the note on the payment link form) — until it does, the coach
 * confirms a FanBasis payment by hand from the client's profile, and this
 * runs the exact same downstream logic Stripe's webhook would have.
 */
export async function finalizeManualPaymentLink(paymentLinkId: string) {
  const paymentLink = await prisma.paymentLink.findUnique({
    where: { id: paymentLinkId },
    include: { plan: true, template: true },
  });
  if (!paymentLink || paymentLink.status === 'paid') return null;

  return createAgreementAndPayment(paymentLink, `manual-${paymentLinkId}`);
}

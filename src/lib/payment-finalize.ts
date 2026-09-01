import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { renderAgreementTemplate, formatAgreementDate } from '@/lib/agreement';
import { describePaymentStructure } from '@/lib/plans';
import { checkoutRefs } from '@/lib/billing';
import { recordSubscriptionFromCheckout } from '@/lib/subscription-sync';
import { isEntitled } from '@/lib/auth';
import { notifyCoach } from '@/lib/notifications';
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

  const finalize = () =>
    prisma.$transaction([
    prisma.paymentLink.update({ where: { id: paymentLink.id }, data: { status: 'paid' } }),
    /*
      Upsert, not create.

      This and the invoice.paid webhook both describe the same first charge,
      they are triggered by different Stripe events, and nothing sequences
      them — a real $1 payment produced TWO succeeded rows 537ms apart, and
      the coach's screen read "$2.00 collected over 2 payments" for one
      dollar. On a fixed payment plan that is worse than cosmetic: the count
      is what cancels the subscription, so a duplicated signup charge ends a
      six-payment plan on the fifth.

      Payment.paymentLinkId is unique, so keying the row to the link makes
      the database itself the referee: whichever handler arrives first
      inserts, and the other lands on ON CONFLICT and changes nothing. An
      empty update is deliberate — if the webhook got here first its row
      already carries the invoice id, which is the better reference of the
      two, and overwriting it with the session id would break the idempotency
      check on any later retry of that invoice.
    */
    prisma.payment.upsert({
      where: { paymentLinkId: paymentLink.id },
      create: {
        clientId: paymentLink.clientId,
        paymentLinkId: paymentLink.id,
        provider: paymentLink.provider,
        providerPaymentId,
        amount: price,
        status: 'succeeded',
        paidAt: new Date(),
      },
      update: {},
    }),
    /*
      Upsert, for the same reason the Payment above is one.

      The webhook and the success page both call this, and the guard that
      stops the second one (`status === 'paid'`) only helps if the first has
      already committed. When they overlap — which is the normal case, since
      the client lands on the success page in the same second Stripe fires the
      event — the loser hit a unique violation on paymentLinkId, the whole
      transaction rolled back, and the client sat on "Finalizing your
      payment…" while their perfectly good payment went unrecorded.

      An empty update: the agreement the winner wrote is already correct, and
      re-rendering over it could clobber a signature that arrived in between.
    */
    prisma.agreement.upsert({
      where: { paymentLinkId: paymentLink.id },
      create: {
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
      update: {},
    }),
    /*
      A renewal must not lock an active client out of the app.

      createPaymentLink already refuses to demote an entitled client to
      payment_pending, and the note above that guard calls the alternative "a
      live trap". The trap had two doors: this writer set agreement_pending
      unconditionally, so a client on month six who paid a second link lost
      every screen until they signed again — and until the fix on /welcome
      they had no way to reach the new agreement at all.

      A client who is already entitled keeps their access and signs when they
      get to it. Only somebody who has not yet been let in is moved to
      agreement_pending.
    */
    prisma.client.update({
      where: { userId: paymentLink.clientId },
      data: {
        ...(isEntitled(client?.status) ? {} : { status: 'agreement_pending' as const }),
        startDate: paymentLink.startDate,
      },
    }),
  ]);

  /*
    Two callers, one payment, and no lock between them.

    Upserts above make the common collision harmless, but Postgres can still
    raise a unique violation when two inserts race inside overlapping
    transactions. If that happens the other handler has already done the whole
    job correctly — so the right response is to hand back the agreement it
    wrote, not to show somebody who has just paid an error. The notification
    is skipped on this path deliberately: the winner already sent it.
  */
  let agreement: Awaited<ReturnType<typeof finalize>>[2];
  try {
    agreement = (await finalize())[2];
  } catch (err) {
    const existing = await prisma.agreement.findUnique({
      where: { paymentLinkId: paymentLink.id },
    });
    if (!existing) throw err;
    return existing;
  }

  /*
    Tell the coach the money arrived.

    Signing up notified, signing notified, finishing intake notified, a failed
    payment notified — the one event that was silent was a payment landing.
    So a client could pay and sit unsigned with nothing anywhere saying so.
  */
  await notifyCoach(
    paymentLink.clientId,
    'account',
    `paid ${formattedPrice} (${paymentStructure}) — the agreement is waiting on their signature.`
  );

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
  /*
    Two kinds of link end up here.

    A plan priced inside ARISE creates a Checkout Session, and the session id
    itself is the PaymentLink's providerRef — one lookup and we are done.

    A plan backed by a real Stripe price creates a Payment Link, which does
    not expire. Its id is what got stored, and the session Stripe redirects
    with is created fresh at the moment the client pays, so it matches
    nothing here. The session has to be read back to find the link it came
    from. Hence the second lookup rather than a `return null` that would
    strand somebody who had just paid on the "finalizing…" screen forever.
  */
  let session: Awaited<ReturnType<typeof stripe.checkout.sessions.retrieve>> | null = null;

  let paymentLink = await prisma.paymentLink.findFirst({
    where: { providerRef: sessionId },
    include: { plan: true, template: true },
  });

  if (!paymentLink) {
    session = await stripe.checkout.sessions.retrieve(sessionId);

    paymentLink = await prisma.paymentLink.findFirst({
      where: { providerRef: { in: checkoutRefs(session) } },
      include: { plan: true, template: true },
    });
  }

  if (!paymentLink) return null;

  if (paymentLink.status === 'paid') {
    return prisma.agreement.findUnique({ where: { paymentLinkId: paymentLink.id } });
  }

  session = session ?? (await stripe.checkout.sessions.retrieve(sessionId));
  if (session.payment_status !== 'paid') return null;

  const providerPaymentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.id;

  const agreement = await createAgreementAndPayment(paymentLink, providerPaymentId);

  /*
    Remember who this person is at Stripe.

    Nothing stored a customer id before, so every checkout let Stripe mint a
    fresh Customer and a client who bought twice became two people over
    there. Worse, with no single customer there was nothing to hang a billing
    portal off — a declining card was a dead end where the coach could watch
    it fail and the client had no way to update anything.

    Captured here rather than at link creation because a Payment Link cannot
    be given a customer; Stripe makes one when the client actually pays, and
    this is the first moment the id exists for both kinds of link.

    Best-effort on purpose: they have paid, and failing to file this must not
    undo that. A later checkout will catch it.
  */
  const stripeCustomerId =
    typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;

  if (stripeCustomerId) {
    try {
      await prisma.client.update({
        where: { userId: paymentLink.clientId },
        data: { stripeCustomerId },
      });
    } catch (err) {
      // A unique violation here means the id is already on somebody — which
      // would be a real problem, so it is logged rather than ignored.
      console.error('Could not record the Stripe customer', {
        clientId: paymentLink.clientId,
        stripeCustomerId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /*
    A recurring plan leaves a live subscription behind at Stripe that will
    keep charging. Record it, so the invoice webhooks have something to
    attach payments to and so a fixed plan can be counted down and stopped.

    This runs after the agreement rather than inside its transaction: the
    client has paid, and a failure to file the bookkeeping should not undo
    that or block them from signing. A missed row is recoverable — the next
    invoice arrives with the subscription id on it.
  */
  const stripeSubscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;

  if (stripeSubscriptionId) {
    try {
      await recordSubscriptionFromCheckout(
        paymentLink.id,
        paymentLink.clientId,
        paymentLink.planId,
        stripeSubscriptionId
      );
    } catch (err) {
      console.error('Could not record subscription from checkout', {
        paymentLinkId: paymentLink.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return agreement;
}

/**
 * Asks Stripe whether a link that still reads "pending" was in fact paid, and
 * finishes the job if it was.
 *
 * The dead end this exists for: a client pays, the webhook does not arrive (or
 * arrives before the endpoint is configured, or fails), and they close the tab
 * before the success page can act as the fallback. Their money is at Stripe,
 * their link says pending, no agreement exists, and there was nothing anywhere
 * in the console that could rescue them — "Mark as Paid" only ever appeared
 * for FanBasis links. The only route out was a hand-written database edit.
 *
 * This asks the payment processor rather than taking anybody's word for it, so
 * it cannot invent a payment that did not happen. Returns the agreement if it
 * finalized one, null if Stripe says nothing was paid.
 */
export async function recheckStripePaymentLink(paymentLinkId: string) {
  const link = await prisma.paymentLink.findUnique({ where: { id: paymentLinkId } });
  if (!link || link.provider !== 'stripe' || link.status === 'paid') return null;

  /*
    Two shapes of reference, same as finalizeStripeSession has to handle. A
    checkout session id can be finalized directly. A Payment Link id cannot —
    it is not a session — so its sessions are listed and the paid one, if any,
    is what gets finalized.
  */
  if (link.providerRef.startsWith('cs_')) {
    return finalizeStripeSession(link.providerRef);
  }

  const sessions = await stripe.checkout.sessions.list({
    payment_link: link.providerRef,
    limit: 20,
  });
  const paid = sessions.data.find((s) => s.payment_status === 'paid');
  if (!paid) return null;

  return finalizeStripeSession(paid.id);
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

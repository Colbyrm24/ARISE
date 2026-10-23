import type Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { todayIn, zoneOf } from '@/lib/day';
import { addDays, deployProgram, setActiveProgram } from '@/lib/program-deploy';
import { notify } from '@/lib/notifications';

/*
  Follow My Split: from a stranger on a bio link to somebody training on the
  program, with nobody in the loop.

  The coaching funnel is built around the coach — he sends an invite, picks a
  price, and an agreement is signed before anything opens. None of that fits a
  $16.99 subscription that hundreds of people might buy, so this path is its
  own: a Stripe Checkout Session marked as a program purchase, and on payment
  the member's calendar is written straight from the offer's program.

  Everything Stripe tells us is keyed back to the member through the session's
  metadata (`arise_kind: program`), on the session AND on the subscription, so
  whichever webhook arrives first can find who it belongs to.
*/

export const PROGRAM_KIND = 'program';

/** How far ahead a member's calendar is written. The daily run keeps it topped up. */
export const MEMBER_WEEKS = 12;
/** Top a member up when fewer than this many days are left on their calendar. */
export const TOP_UP_WHEN_DAYS_LEFT = 56;
export const TOP_UP_WEEKS = 4;

export type ProgramMeta = { clientId: string; offerId: string };

/** Reads our marker off a Checkout Session or a Subscription. */
export function programMetaOf(obj: { metadata?: Stripe.Metadata | null } | null | undefined): ProgramMeta | null {
  const m = obj?.metadata;
  if (!m || m.arise_kind !== PROGRAM_KIND || !m.client_id || !m.offer_id) return null;
  return { clientId: m.client_id, offerId: m.offer_id };
}

export async function getOfferBySlug(slug: string) {
  return prisma.programOffer.findUnique({
    where: { slug },
    include: {
      plan: true,
      template: {
        select: {
          id: true,
          name: true,
          programDays: {
            orderBy: { weekday: 'asc' },
            select: {
              weekday: true,
              kind: true,
              label: true,
              stepTarget: true,
              workout: { select: { name: true, estMinutes: true } },
            },
          },
        },
      },
      coach: { select: { id: true, profile: { select: { fullName: true, avatarUrl: true } } } },
    },
  });
}

/**
 * A Stripe Checkout page for one member.
 *
 * Reuses the member's Stripe customer when they have one — somebody who
 * cancelled and comes back keeps one billing history and one card on file —
 * and otherwise lets Checkout make the customer from their email.
 */
export async function createProgramCheckout(opts: {
  clientId: string;
  email: string;
  offer: { id: string; slug: string; plan: { stripePriceId: string | null } };
  stripeCustomerId: string | null;
  siteUrl: string;
}) {
  if (!opts.offer.plan.stripePriceId) throw new Error('This offer has no Stripe price.');

  const metadata = {
    arise_kind: PROGRAM_KIND,
    client_id: opts.clientId,
    offer_id: opts.offer.id,
  };

  return stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: opts.offer.plan.stripePriceId, quantity: 1 }],
    ...(opts.stripeCustomerId
      ? { customer: opts.stripeCustomerId }
      : { customer_email: opts.email }),
    client_reference_id: opts.clientId,
    metadata,
    subscription_data: { metadata },
    allow_promotion_codes: true,
    success_url: `${opts.siteUrl}/follow/${opts.offer.slug}/welcome?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${opts.siteUrl}/follow/${opts.offer.slug}?cancelled=1`,
  });
}

/**
 * The local Subscription row for a member's Stripe subscription.
 *
 * Keyed on the Stripe id, which is unique per provider, so the webhook and
 * the success page writing it at the same moment end up with one row.
 */
export async function recordProgramSubscription(
  meta: ProgramMeta,
  stripeSubscriptionId: string
) {
  const offer = await prisma.programOffer.findUnique({
    where: { id: meta.offerId },
    select: { planId: true },
  });
  if (!offer) return null;

  const existing = await prisma.subscription.findFirst({
    where: { provider: 'stripe', providerSubscriptionId: stripeSubscriptionId },
  });
  if (existing) return existing;

  try {
    return await prisma.subscription.create({
      data: {
        clientId: meta.clientId,
        planId: offer.planId,
        provider: 'stripe',
        providerSubscriptionId: stripeSubscriptionId,
        status: 'active',
      },
    });
  } catch {
    // Lost the race to the other writer; theirs is the row.
    return prisma.subscription.findFirst({
      where: { provider: 'stripe', providerSubscriptionId: stripeSubscriptionId },
    });
  }
}

/**
 * Puts the offer's program on a member's calendar, starting on THEIR today.
 *
 * Skipped when they are already on this program with sessions ahead of them —
 * the success page and the webhook both call this, and a member who rejoins
 * mid-block should keep the calendar they had rather than start over.
 */
export async function startMemberCalendar(clientId: string, templateId: string) {
  const who = await prisma.user.findUnique({
    where: { id: clientId },
    select: { profile: { select: { timezone: true } } },
  });
  const today = todayIn(zoneOf(who?.profile));

  const [current, ahead] = await Promise.all([
    prisma.clientProgram.findFirst({ where: { clientId, active: true }, select: { templateId: true } }),
    prisma.scheduledItem.count({ where: { clientId, templateId, date: { gte: today } } }),
  ]);

  if (current?.templateId !== templateId || ahead === 0) {
    await deployProgram({ clientId, templateId, startDate: today, weeks: MEMBER_WEEKS });
  }
  await setActiveProgram(clientId, templateId);
}

/**
 * Turns a paid program checkout into a member who can train.
 *
 * Idempotent: the success page and `checkout.session.completed` both land
 * here, often within the same second, and either may be first.
 */
export async function finalizeProgramSession(session: Stripe.Checkout.Session) {
  const meta = programMetaOf(session);
  if (!meta) return null;
  if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
    return null;
  }

  const offer = await prisma.programOffer.findUnique({
    where: { id: meta.offerId },
    select: { id: true, templateId: true, coachId: true, title: true },
  });
  const client = await prisma.client.findUnique({
    where: { userId: meta.clientId },
    select: { userId: true, status: true, tier: true, startDate: true },
  });
  // A coaching client can't be turned into a member by a checkout; the join
  // route refuses to make one, so this is only a guard.
  if (!offer || !client || client.tier !== 'program') return null;

  const stripeCustomerId =
    typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;
  const stripeSubscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;

  const wasActive = client.status === 'active';

  await prisma.client.update({
    where: { userId: client.userId },
    data: {
      status: 'active',
      offerId: offer.id,
      ...(client.startDate ? {} : { startDate: new Date() }),
    },
  });

  if (stripeCustomerId) {
    // Its own write: the column is unique, and a customer already recorded on
    // this row (or, in a mess, another one) must not stop the member starting.
    await prisma.client
      .update({ where: { userId: client.userId }, data: { stripeCustomerId } })
      .catch(() => null);
  }

  if (stripeSubscriptionId) await recordProgramSubscription(meta, stripeSubscriptionId);

  await startMemberCalendar(client.userId, offer.templateId);

  if (!wasActive) {
    const who = await prisma.user.findUnique({
      where: { id: client.userId },
      select: { email: true, profile: { select: { fullName: true } } },
    });
    await notify(
      offer.coachId,
      'account',
      `${who?.profile?.fullName || who?.email || 'Someone'} subscribed to ${offer.title}.`,
      { clientId: client.userId }
    ).catch(() => null);
  }

  return { clientId: client.userId };
}

/**
 * Keeps every member's calendar running ahead of them.
 *
 * Members are written twelve weeks at a time rather than a year, so the rows
 * stay cheap to rewrite when the coach changes the program. Called by the
 * daily run; tops up anyone with less than eight weeks left, four weeks at a
 * time, continuing from the day after their last scheduled session so their
 * week keeps its shape.
 */
export async function topUpMemberCalendars(limit = 200) {
  const members = await prisma.client.findMany({
    where: { tier: 'program', status: 'active', offerId: { not: null } },
    select: { userId: true, offer: { select: { templateId: true } } },
    take: 2000,
  });
  if (members.length === 0) return { checked: 0, extended: 0 };

  const ids = members.map((m) => m.userId);
  const last = await prisma.scheduledItem.groupBy({
    by: ['clientId'],
    where: { clientId: { in: ids } },
    _max: { date: true },
  });
  const lastBy = new Map<string, Date | null>(
    last.map((r: { clientId: string; _max: { date: Date | null } }) => [r.clientId, r._max.date])
  );

  const horizon = addDays(new Date(), TOP_UP_WHEN_DAYS_LEFT);
  let extended = 0;

  for (const m of members) {
    if (extended >= limit) break;
    const templateId = m.offer?.templateId;
    if (!templateId) continue;
    const lastDate = lastBy.get(m.userId) ?? null;

    if (!lastDate) {
      await startMemberCalendar(m.userId, templateId);
      extended += 1;
      continue;
    }
    if (lastDate.getTime() >= horizon.getTime()) continue;

    await deployProgram({
      clientId: m.userId,
      templateId,
      startDate: addDays(lastDate, 1),
      weeks: TOP_UP_WEEKS,
    });
    extended += 1;
  }

  return { checked: members.length, extended };
}

/**
 * Rewrites every active member's calendar from their today with the
 * program as it is now — the button the coach presses after changing his
 * split. Finished sessions and the past are never touched (deployProgram
 * guarantees both).
 */
export async function refreshMemberCalendars(offerId: string) {
  const offer = await prisma.programOffer.findUnique({
    where: { id: offerId },
    select: { templateId: true },
  });
  if (!offer) return 0;

  const members = await prisma.client.findMany({
    where: { tier: 'program', status: 'active', offerId },
    select: { userId: true, user: { select: { profile: { select: { timezone: true } } } } },
  });

  for (const m of members) {
    await deployProgram({
      clientId: m.userId,
      templateId: offer.templateId,
      startDate: todayIn(zoneOf(m.user.profile)),
      weeks: MEMBER_WEEKS,
    });
    await setActiveProgram(m.userId, offer.templateId);
  }
  return members.length;
}

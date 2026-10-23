import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { todayIn } from '@/lib/day';
import { getSiteUrl } from '@/lib/site-url';
import { attachClientToCoach } from '@/lib/onboard-client';
import { parseBirthDate } from '@/lib/membership';
import { stripe } from '@/lib/stripe';
import { activateFromSubscription, createProgramCheckout, programMetaOf } from '@/lib/program-offer';

/*
  Follow My Split, from account to Stripe in one request.

  The browser has already made (or signed into) the Supabase account by the
  time this runs, so the person is read off that verified session — never off
  the body. The body only says which offer, their first name, and their date
  of birth.

  What this will NOT do is turn a 1-on-1 coaching client into a $16.99
  member. Their account carries an agreement, a price and a status the coach
  manages; quietly re-tiering it from a public page would be how a $750 client
  ends up paying $16.99. They are sent back to their app instead.
*/

/*
  Which existing coaching records may become a member at all.

  Only somebody who never started (`lead`) or whose coaching is over
  (`cancelled`), and only with nothing live on the money side. Even then their
  tier is NOT changed here — it changes in finalizeProgramSession, after they
  have actually paid. Re-tiering on the way INTO Stripe meant a coaching
  client who opened the bio link and closed checkout was silently moved out
  of the coach's roster and onto the member app.
*/
const COACHING_CAN_CONVERT = new Set(['lead', 'cancelled']);
const LIVE_SUBSCRIPTION = ['active', 'past_due'];

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const slug = typeof body.slug === 'string' ? body.slug : '';
  const firstName =
    typeof body.firstName === 'string' ? body.firstName.trim().slice(0, 60) : '';

  const offer = await prisma.programOffer.findUnique({
    where: { slug },
    include: { plan: { select: { stripePriceId: true } } },
  });
  if (!offer || !offer.active || !offer.plan.stripePriceId) {
    return NextResponse.json({ error: 'This program is not open right now.' }, { status: 404 });
  }

  const existingUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: { clientRecord: true, profile: true },
  });

  if (existingUser && existingUser.role !== 'client') {
    return NextResponse.json(
      { error: 'This is a coach account — sign in with a client account to subscribe.' },
      { status: 409 }
    );
  }

  const client = existingUser?.clientRecord ?? null;

  if (client && client.tier === 'program' && client.status === 'active') {
    return NextResponse.json({ redirectTo: '/today' });
  }

  if (client && client.tier !== 'program') {
    const [liveSub, openLink] = await Promise.all([
      prisma.subscription.findFirst({
        where: { clientId: client.userId, deletedAt: null, status: { in: LIVE_SUBSCRIPTION } },
        select: { id: true },
      }),
      prisma.paymentLink.findFirst({
        where: { clientId: client.userId, status: 'pending' },
        select: { id: true },
      }),
    ]);
    if (!COACHING_CAN_CONVERT.has(client.status) || liveSub || openLink) {
      return NextResponse.json(
        {
          error:
            "Your account is set up for 1-on-1 coaching, so you don't need this — message your coach or open your app.",
        },
        { status: 409 }
      );
    }
  }

  /*
    Age. Asked once; a returning member who already gave it is not asked
    again, and cannot change it from here — the under-18 version is decided by
    the date on file, and a public form is not the place to rewrite it.

    Today in the default zone: this person has no timezone on file yet, and
    a few hours either side of midnight on someone's 13th birthday is not
    worth a second question.
  */
  let birthDate = client?.birthDate ?? null;
  if (!birthDate) {
    const parsed = parseBirthDate(body.birthDate, todayIn(null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.reason }, { status: 400 });
    birthDate = parsed.date;
  }

  const dbUser =
    existingUser ??
    (await prisma.user.upsert({
      where: { id: user.id },
      update: {},
      create: {
        id: user.id,
        email: user.email,
        role: 'client',
        profile: { create: { fullName: firstName || null } },
      },
    }));

  if (firstName && !existingUser?.profile?.fullName) {
    await prisma.profile
      .upsert({
        where: { userId: dbUser.id },
        create: { userId: dbUser.id, fullName: firstName },
        update: { fullName: firstName },
      })
      .catch(() => null);
  }

  if (!client) {
    await prisma.client.create({
      data: {
        userId: dbUser.id,
        status: 'payment_pending',
        tier: 'program',
        birthDate,
        offerId: offer.id,
        coachId: offer.coachId,
      },
    });
    await attachClientToCoach(dbUser.id, offer.coachId);
  } else if (client.tier === 'program') {
    await prisma.client.update({
      where: { userId: dbUser.id },
      data: { status: 'payment_pending', birthDate, offerId: offer.id, coachId: offer.coachId },
    });
    await attachClientToCoach(dbUser.id, offer.coachId);
  } else if (!client.birthDate) {
    // A coaching lead: keep everything as it is until they pay.
    await prisma.client.update({ where: { userId: dbUser.id }, data: { birthDate } });
  }

  try {
    /*
      One Stripe customer per person, made before checkout rather than by it.

      Letting Checkout create the customer from an email meant two tabs, or a
      second tap after a slow redirect, made two customers — and the portal
      can only ever show one, so a duplicate subscription on the other would
      bill forever with no cancel button anywhere.
    */
    let stripeCustomerId = client?.stripeCustomerId ?? null;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: firstName || existingUser?.profile?.fullName || undefined,
        metadata: { arise_client_id: dbUser.id },
      });
      stripeCustomerId = customer.id;
      await prisma.client.update({
        where: { userId: dbUser.id },
        data: { stripeCustomerId },
      });
    }

    /*
      Already paid? The success page can fail and the webhook can be slow, and
      then this person is bounced back here still `payment_pending` — with a
      subscription running at Stripe. Opening a second checkout would charge
      them twice. Find the live one and switch them on instead.
    */
    const existingSubs = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: 'all',
      limit: 20,
    });
    const paying = existingSubs.data.find(
      (sub) => programMetaOf(sub) && ['active', 'trialing', 'past_due'].includes(sub.status)
    );
    if (paying) {
      await activateFromSubscription(dbUser.id, paying);
      return NextResponse.json({ redirectTo: '/today' });
    }

    const checkout = await createProgramCheckout({
      clientId: dbUser.id,
      email: user.email,
      offer: { id: offer.id, slug: offer.slug, plan: offer.plan },
      stripeCustomerId,
      siteUrl: getSiteUrl(),
    });
    if (!checkout.url) throw new Error('Stripe returned no checkout URL');
    return NextResponse.json({ checkoutUrl: checkout.url });
  } catch (err) {
    console.error('Could not open a Follow My Split checkout', {
      clientId: dbUser.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Your account is made, but the payment page would not open. Try again in a minute.' },
      { status: 502 }
    );
  }
}

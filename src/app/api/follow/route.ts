import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { todayIn } from '@/lib/day';
import { getSiteUrl } from '@/lib/site-url';
import { attachClientToCoach } from '@/lib/onboard-client';
import { parseBirthDate } from '@/lib/membership';
import { createProgramCheckout } from '@/lib/program-offer';

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

const CAN_BECOME_MEMBER = new Set(['lead', 'payment_pending', 'cancelled']);

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
  if (client && client.tier !== 'program' && !CAN_BECOME_MEMBER.has(client.status)) {
    return NextResponse.json(
      { error: "You're already coached 1-on-1, so you have the full program in your app." },
      { status: 409 }
    );
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

  const memberData = {
    tier: 'program',
    birthDate,
    offerId: offer.id,
    coachId: offer.coachId,
  };

  if (!client) {
    await prisma.client.create({
      data: { userId: dbUser.id, status: 'payment_pending', ...memberData },
    });
  } else {
    await prisma.client.update({
      where: { userId: dbUser.id },
      data: {
        ...memberData,
        // Only the not-yet-started states move; an active member returned above.
        status: 'payment_pending',
      },
    });
  }

  // The leaderboard and notifications find the coach through this row.
  await attachClientToCoach(dbUser.id, offer.coachId);

  try {
    const checkout = await createProgramCheckout({
      clientId: dbUser.id,
      email: user.email,
      offer: { id: offer.id, slug: offer.slug, plan: offer.plan },
      stripeCustomerId: client?.stripeCustomerId ?? null,
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

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { notify } from '@/lib/notifications';
import { createStripePaymentLink } from '@/lib/payment-link';
import { attachClientToCoach } from '@/lib/onboard-client';
import { arrivingStatus, statusForExistingClient } from '@/lib/invite-arrival';

/*
  The whole funnel, in one request.

  A client who has just created their account on a join link should not be
  handed a second thing to do. Signing up, being attached to the coach,
  getting the payment link the coach chose for them and arriving at Stripe is
  one continuous motion, and this route is the seam where it happens.

  Everything is authorised by the invite token, not by who is asking: the
  person holding the link is the person the coach sent it to. The session is
  still required — the account must exist before it can own a payment — and
  the email and id are read off that verified session, never off the body.
*/
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const token: string | undefined = typeof body.token === 'string' ? body.token : undefined;
  const fullName: string | undefined = typeof body.fullName === 'string' ? body.fullName : undefined;
  if (!token) return NextResponse.json({ error: 'Missing invite.' }, { status: 400 });

  const invite = await prisma.clientInvite.findFirst({
    where: { token, usedAt: null, deletedAt: null },
    include: { plan: true },
  });
  if (!invite) {
    return NextResponse.json({ error: 'That invite has already been used.' }, { status: 410 });
  }

  /*
    The account row. `upsert` because the browser can retry this — a flaky
    network on the one request that turns a signup into a client is not a
    reason to strand somebody.
  */
  const dbUser = await prisma.user.upsert({
    where: { id: user.id },
    update: {},
    create: {
      id: user.id,
      email: user.email!,
      role: 'client',
      profile: { create: { fullName } },
    },
  });

  /*
    The name, if we were given one and don't already have one.

    Separate from the upsert above because `update: {}` means an account that
    already exists learns nothing from this request — and someone moved across
    from another platform can easily already have an account here from a
    previous look at the app. An existing name is never overwritten; the
    person's own spelling of it beats what the coach typed on an invite.
  */
  if (fullName) {
    try {
      await prisma.profile.upsert({
        where: { userId: dbUser.id },
        create: { userId: dbUser.id, fullName },
        update: {},
      });
      await prisma.profile.updateMany({
        where: { userId: dbUser.id, fullName: null },
        data: { fullName },
      });
    } catch {
      // A missing name is cosmetic; never cost somebody the signup over it.
    }
  }

  /*
    The client row, attached to the coach who invited them.

    This used to be nested inside the upsert above, which meant it only ever
    ran for a brand-new account: anybody who already had one got `update: {}`,
    no coach, no status, no start date — and was told it had all worked. That
    is precisely the person being moved off another platform, who signed up to
    look around a month ago and is now being invited properly.

    An existing record is moved forward, never backward. Status is only set
    from the states that mean "hasn't started yet", so re-using a link on an
    active client cannot drop them back to payment_pending and lock them out
    of the app they are already using.
  */
  const existing = await prisma.client.findUnique({
    where: { userId: dbUser.id },
    select: { status: true, startDate: true },
  });

  /*
    Their startDate is the one the coach typed on the invite, not today: these
    people started months ago and a January client whose record says they began
    this week makes every week-count and every "how long have they been with
    me" answer wrong from day one.
  */
  const arriving = arrivingStatus(invite.skipPayment);

  if (!existing) {
    await prisma.client.create({
      data: {
        userId: dbUser.id,
        status: arriving,
        coachId: invite.coachId,
        ...(invite.skipPayment ? { startDate: invite.startDate } : {}),
      },
    });
  } else {
    const next = statusForExistingClient(existing.status, arriving);

    await prisma.client.update({
      where: { userId: dbUser.id },
      data: {
        coachId: invite.coachId,
        ...(next ? { status: next } : {}),
        ...(invite.skipPayment && !existing.startDate
          ? { startDate: invite.startDate }
          : {}),
      },
    });
  }

  /*
    And the relationship row, which is what the rest of the app actually reads.

    Setting Client.coachId alone was the single most expensive bug in the
    funnel: seven screens and every coach notification resolve the coach
    through CoachClientRelationship, nothing ever wrote one here, and so a
    client could pay, sign and finish the intake with the coach hearing
    nothing and his inbox 404ing on them.
  */
  await attachClientToCoach(dbUser.id, invite.coachId);

  /*
    Claim the invite before spending money at Stripe.

    An `updateMany` filtered on `usedAt: null` is the lock: two taps on the
    submit button race here, exactly one updates a row, and the loser never
    reaches the checkout call. Doing this after the Stripe call instead would
    make two payment links for one person, and they'd be charged twice if
    they opened both.
  */
  const claimed = await prisma.clientInvite.updateMany({
    where: { id: invite.id, usedAt: null },
    data: { usedAt: new Date(), usedBy: dbUser.id },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ error: 'That invite has already been used.' }, { status: 410 });
  }

  /*
    The whole point of the flag: no checkout, no agreement, no money.

    Claimed above like any other invite, so the link is single-use either way.
    The coach is told in the same breath, because a client arriving without a
    payment event is otherwise completely silent — there is no Stripe webhook
    to announce them.
  */
  if (invite.skipPayment) {
    await notify(
      invite.coachId,
      'account',
      `${fullName || user.email} joined from your existing-client link and is at the intake.`,
      { clientId: dbUser.id }
    );
    return NextResponse.json({ redirectTo: '/onboarding' });
  }

  /*
    Past the skip-payment branch, so a template is guaranteed by
    createClientInvite — which refuses to make a paying invite without one.
    Belt and braces anyway: a null here would mint a payment link whose
    agreement points at nothing, and the client would pay and then land on a
    broken page.
  */
  if (!invite.agreementTemplateId) {
    await prisma.clientInvite.update({
      where: { id: invite.id },
      data: { usedAt: null, usedBy: null },
    });
    return NextResponse.json(
      { error: 'Your account is set up, but this link is missing its agreement.' },
      { status: 500 }
    );
  }

  /*
    Wrapped, because a throw here used to eat the invite.

    createStripePaymentLink talks to Stripe over the network. Anything it
    throws — a timeout, a bad key, a rate limit — unwound the whole request
    with the invite already marked used, so the link the coach texted was dead
    and the client was stuck at a signup page that said their invite had
    already been used. Catching it turns the worst case back into "try that
    link again".
  */
  let link: Awaited<ReturnType<typeof createStripePaymentLink>> = null;
  try {
    link = await createStripePaymentLink({
      clientId: dbUser.id,
      plan: invite.plan,
      agreementTemplateId: invite.agreementTemplateId,
      startDate: invite.startDate,
      priceOverride: invite.priceOverride === null ? null : Number(invite.priceOverride),
      termMonthsOverride: invite.termMonthsOverride,
      numberOfPaymentsOverride: invite.numberOfPaymentsOverride,
    });
  } catch {
    link = null;
  }

  if (!link) {
    /*
      Stripe refused. The account is real and attached to the coach, so this
      is a client sitting at payment_pending rather than a lost person — the
      coach can generate a link by hand from their account screen. Give the
      invite back so the same link still works if he'd rather they retry.

      The coach is told what actually happened. He used to be told they were
      "at the payment step" here, because the notification fired before this
      check — so the one case where somebody needs him is the case that looked
      identical to the case where nobody does.
    */
    await prisma.clientInvite.update({
      where: { id: invite.id },
      data: { usedAt: null, usedBy: null },
    });
    await notify(
      invite.coachId,
      'account',
      `${fullName || user.email} signed up but Stripe would not open their payment page — send them a payment link.`,
      { clientId: dbUser.id }
    );
    return NextResponse.json(
      { error: 'Your account is set up, but the payment page could not be opened.' },
      { status: 502 }
    );
  }

  await notify(
    invite.coachId,
    'account',
    `${fullName || user.email} joined on your link and is at the payment step.`,
    { clientId: dbUser.id }
  );

  return NextResponse.json({ checkoutUrl: link.checkoutUrl });
}

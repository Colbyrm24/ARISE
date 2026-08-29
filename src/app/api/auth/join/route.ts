import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { notify } from '@/lib/notifications';
import { createStripePaymentLink } from '@/lib/payment-link';

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
    The account row, and the client row attached to the coach who invited
    them. `upsert` because the browser can retry this — a flaky network on
    the one request that turns a signup into a client is not a reason to
    strand somebody.
  */
  const dbUser = await prisma.user.upsert({
    where: { id: user.id },
    update: {},
    create: {
      id: user.id,
      email: user.email!,
      role: 'client',
      profile: { create: { fullName } },
      clientRecord: { create: { status: 'payment_pending', coachId: invite.coachId } },
    },
  });

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

  const link = await createStripePaymentLink({
    clientId: dbUser.id,
    plan: invite.plan,
    agreementTemplateId: invite.agreementTemplateId,
    startDate: invite.startDate,
    priceOverride: invite.priceOverride === null ? null : Number(invite.priceOverride),
    termMonthsOverride: invite.termMonthsOverride,
    numberOfPaymentsOverride: invite.numberOfPaymentsOverride,
  });

  await notify(
    invite.coachId,
    'account',
    `${fullName || user.email} joined on your link and is at the payment step.`,
    { clientId: dbUser.id }
  );

  if (!link) {
    /*
      Stripe refused. The account is real and attached to the coach, so this
      is a client sitting at payment_pending rather than a lost person — the
      coach can generate a link by hand from their account screen. Give the
      invite back so the same link still works if he'd rather they retry.
    */
    await prisma.clientInvite.update({
      where: { id: invite.id },
      data: { usedAt: null, usedBy: null },
    });
    return NextResponse.json(
      { error: 'Your account is set up, but the payment page could not be opened.' },
      { status: 502 }
    );
  }

  return NextResponse.json({ checkoutUrl: link.checkoutUrl });
}

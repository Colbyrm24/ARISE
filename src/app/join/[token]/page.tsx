import { prisma } from '@/lib/prisma';
import { SystemWindow, SystemWindowContent } from '@/components/ui/system-window';
import { describePaymentStructure } from '@/lib/plans';
import { appliedPrice } from '@/lib/payment-link';
import { JoinForm } from './join-form';

/*
  Where a coach's link lands.

  This is the front door of the whole business and the client sees it before
  they have given anybody a penny, so it says exactly what they are about to
  buy — the real figure, the real cadence, the coach's own name — above the
  form. A signup box with no terms on it is how people bounce.

  Public on purpose: the token IS the authorisation, and requiring a login to
  read an invitation would be a circle.
*/

export const dynamic = 'force-dynamic';

export default async function JoinPage({ params }: { params: { token: string } }) {
  const invite = await prisma.clientInvite.findFirst({
    where: { token: params.token, deletedAt: null },
    include: {
      plan: true,
      coach: { include: { profile: true } },
    },
  });

  if (!invite || invite.usedAt) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-5 px-5 py-10">
        <SystemWindow title="This link is spent">
          <SystemWindowContent className="pt-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {invite?.usedAt
                ? 'This invite has already been used to create an account. If that was you, sign in instead.'
                : 'That link is not valid. Ask your coach to send you a fresh one.'}
            </p>
            <a
              href="/login"
              className="readout mt-4 inline-block border border-accent/50 px-3 py-2 text-[11px] uppercase tracking-wider text-accent transition-colors hover:border-accent"
            >
              Sign in
            </a>
          </SystemWindowContent>
        </SystemWindow>
      </div>
    );
  }

  const { effective } = appliedPrice(
    invite.plan,
    invite.priceOverride === null ? null : Number(invite.priceOverride)
  );

  // What they will actually be charged, in the same words the agreement will
  // use — the two must never describe the same deal differently.
  const terms = describePaymentStructure({
    price: effective,
    billingType: invite.plan.billingType,
    paymentFrequency: invite.plan.paymentFrequency,
    numberOfPayments: invite.numberOfPaymentsOverride ?? invite.plan.numberOfPayments,
  });

  const coachName = invite.coach.profile?.fullName ?? 'your coach';

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-5 px-5 py-10">
      <header>
        <p className="readout text-[11px] uppercase text-muted-foreground">ARISE</p>
        <h1 className="mt-1.5 text-2xl font-bold">
          {invite.name ? `${invite.name.split(' ')[0]}, you're in.` : "You're in."}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {coachName} set this up for you. Make your account and you&apos;ll go straight to
          payment, then the agreement, then the app.
        </p>
      </header>

      <SystemWindow title={invite.plan.name} meta={`[${terms}]`}>
        <SystemWindowContent className="pt-4">
          <JoinForm token={invite.token} defaultName={invite.name ?? ''} />
        </SystemWindowContent>
      </SystemWindow>

      <p className="text-xs leading-relaxed text-muted-foreground">
        You&apos;ll see the coaching agreement in full before you sign it, after payment. Nothing
        starts until you have read it.
      </p>
    </div>
  );
}

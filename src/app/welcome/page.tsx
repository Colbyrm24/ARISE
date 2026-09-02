import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { requireClient, isEntitled } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { SystemWindow, SystemWindowContent, Cell } from '@/components/ui/system-window';
import { STATUS_WAITING } from '@/lib/client-status';
import { ONBOARDING_STEPS } from '@/lib/onboarding';
import { SignOutButton } from '@/components/client/sign-out-button';
import { Composer } from '@/components/messages/composer';
import { sendMessageToCoach, coachIdForClient } from '@/app/(client)/messages/actions';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/*
  Where a client waits.

  Before this existed, somebody who signed up but hadn't paid landed in the
  full app — every screen, every feature, nothing bought. Gating that was the
  fix; this is the other half of it, because a gate with nothing behind it is
  just a locked door.

  It says exactly which step they're on and what happens next, and it keeps
  the two things a lead can legitimately do — fill in their intake, and reach
  their coach — within one tap.
*/

/*
  How many sections the intake actually has. Read from the form's own
  definition so the count on this screen can never drift from the number of
  sections a client is asked to fill.
*/
const INTAKE_SECTIONS = ONBOARDING_STEPS.length;

const STEPS = [
  { key: 'signed-up', label: 'Account created' },
  { key: 'paid', label: 'Payment' },
  { key: 'signed', label: 'Agreement signed' },
  { key: 'in', label: 'Coaching starts' },
] as const;

function reached(status: string) {
  switch (status) {
    case 'lead':
      return 1;
    case 'payment_pending':
      return 1;
    case 'paid':
    case 'agreement_pending':
      return 2;
    default:
      return 3;
  }
}

export default async function WelcomePage() {
  const user = await requireClient();
  const status = user.clientRecord?.status ?? 'lead';

  // Somebody who is entitled has no business here — send them to the app.
  if (isEntitled(status)) redirect('/today');

  const firstName = user.profile?.fullName?.split(' ')[0] ?? 'there';
  const waiting = STATUS_WAITING[status] ?? STATUS_WAITING.lead!;
  const done = reached(status);

  const coachId = await coachIdForClient(user.id);

  /*
    The agreement, for somebody who has paid and can't find it.

    This screen used to tell an `agreement_pending` client "the link is in
    your email". There is no email in this product — no sender, no service, no
    dependency — and the only two links to an agreement live in the coach's
    own console and in the Stripe redirect that fires once. So a client who
    paid and closed that tab was told to check an inbox nothing had ever
    written to, and their money was gone with no way back into the funnel.

    It's one query and it ends the dead end.
  */
  const pendingAgreement =
    status === 'agreement_pending' || status === 'paid'
      ? await prisma.agreement.findFirst({
          // `status`, not a signedAt column — Agreement records signing as
          // 'pending_signature' -> 'signed'. The offline Prisma stub types
          // every `where` as `any`, so a wrong field name here compiles
          // locally and only fails on Vercel. It did.
          //
          // `paid` is in here as well as `agreement_pending`. Nothing in the
          // payment path writes `paid` — finalize goes straight to
          // agreement_pending — but it is one of the statuses the coach can
          // set by hand from the console, and one click put a client on
          // "your agreement is on its way" with the agreement already sitting
          // in the database, unreachable.
          where: { clientId: user.id, status: 'pending_signature', deletedAt: null },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        })
      : null;

  /*
    The checkout they walked away from.

    A client who taps back out of Stripe, or whose card declines, keeps the
    status `payment_pending` and a live PaymentLink row — and this screen then
    told them "your coach has sent you a payment link… message them if it
    never arrived". No payment link was ever sent: the coach sent a JOIN link,
    which now reads "this link is spent" if they go back to it. So they sat
    waiting on an email that does not exist, in a product that sends no email,
    with a working checkout URL one query away in the database.

    Same shape as the agreement rescue above, for the step before it — and
    this is the more common one, because abandoning a checkout is a thing
    people do by accident.
  */
  const pendingPayment =
    status === 'payment_pending'
      ? await prisma.paymentLink.findFirst({
          where: { clientId: user.id, status: 'pending', checkoutUrl: { not: null } },
          orderBy: { createdAt: 'desc' },
          select: { id: true, checkoutUrl: true },
        })
      : null;

  const [intakeRaw, thread] = await Promise.all([
    prisma.onboardingResponse.count({
      where: { clientId: user.id, completedAt: { not: null } },
    }),
    // Oldest-first over the last handful, so the exchange reads top to
    // bottom the way a conversation does.
    coachId
      ? prisma.message
          .findMany({
            where: {
              OR: [
                { senderId: user.id, recipientId: coachId },
                { senderId: coachId, recipientId: user.id },
              ],
            },
            orderBy: { createdAt: 'desc' },
            take: 6,
            select: {
              id: true,
              body: true,
              senderId: true,
              attachments: { select: { type: true } },
            },
          })
          .then((rows) => rows.reverse())
      : Promise.resolve([]),
  ]);

  /*
    Clamped rather than trusted. The count is of completed response rows, and
    a step that was retired from ONBOARDING_STEPS would leave its row behind —
    which is how you get "5 of 4 done". Clamping keeps the copy honest whatever
    is in the table.
  */
  const intake = Math.min(intakeRaw, INTAKE_SECTIONS);
  const intakeDone = intake >= INTAKE_SECTIONS;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-5 px-5 py-10">
      <header>
        <p className="readout text-[11px] uppercase text-muted-foreground">ARISE</p>
        <h1 className="mt-1.5 text-2xl font-bold">
          {waiting.title}, {firstName}.
        </h1>
      </header>

      <SystemWindow title="Where you are" meta={`[${done}/4]`}>
        <SystemWindowContent className="flex flex-col gap-4 pt-4">
          <p className="text-sm leading-relaxed text-muted-foreground">{waiting.body}</p>

          <ul className="flex flex-col">
            {STEPS.map((step, i) => (
              <li
                key={step.key}
                className="flex items-center justify-between gap-4 border-b border-border/50 py-2.5 last:border-b-0"
              >
                <span className={`text-sm ${i < done ? '' : 'text-muted-foreground'}`}>
                  {step.label}
                </span>
                <Cell on={i < done} />
              </li>
            ))}
          </ul>

          {/* The one action that moves them, right where they're stuck. */}
          {pendingPayment?.checkoutUrl && (
            <a
              href={pendingPayment.checkoutUrl}
              className="glow flex items-center justify-between gap-3 border border-accent/55 bg-accent/[0.11] px-4 py-3 text-sm font-bold uppercase tracking-[0.14em] text-foreground shadow-[inset_0_0_22px_hsl(var(--accent)/0.14),0_0_28px_-6px_hsl(var(--accent)/0.6)] transition-colors hover:border-accent"
            >
              Finish your payment
              <ArrowRight size={16} />
            </a>
          )}

          {pendingAgreement && (
            <Link
              href={`/agreement/${pendingAgreement.id}`}
              className="glow flex items-center justify-between gap-3 border border-accent/55 bg-accent/[0.11] px-4 py-3 text-sm font-bold uppercase tracking-[0.14em] text-foreground shadow-[inset_0_0_22px_hsl(var(--accent)/0.14),0_0_28px_-6px_hsl(var(--accent)/0.6)] transition-colors hover:border-accent"
            >
              Read and sign your agreement
              <ArrowRight size={16} />
            </Link>
          )}
        </SystemWindowContent>
      </SystemWindow>

      {/*
        The intake is the one useful thing somebody can do while they wait, and
        doing it now is what makes their first week ready on day one instead of
        day four.

        Three states, not two. The old version only asked whether *any* section
        had been filled, so somebody who had answered all four was still told
        to "Finish your intake — 4 of 4 done": a to-do that was already done,
        under a heading saying it was worth doing now, on the screen a waiting
        client stares at the longest. Once it's finished it stops being a task
        and becomes something they can go back and change.

        The section count comes from ONBOARDING_STEPS rather than a literal 4,
        which is what let the copy and the form drift apart in the first place.
      */}
      <SystemWindow title={intakeDone ? 'With your coach' : 'Worth doing now'} plain>
        <SystemWindowContent className="pt-3">
          <Link
            href="/onboarding"
            className="flex items-center justify-between gap-3 text-sm transition-colors hover:text-accent"
          >
            <span>
              {intakeDone
                ? 'Your intake'
                : intake > 0
                  ? 'Finish your intake'
                  : 'Fill in your intake'}
              <span className="readout ml-2 text-[10px] uppercase text-muted-foreground">
                {intakeDone
                  ? `all ${INTAKE_SECTIONS} sections · review or update`
                  : intake > 0
                    ? `${intake} of ${INTAKE_SECTIONS} done`
                    : 'about 5 minutes'}
              </span>
            </span>
            <ArrowRight size={15} className="shrink-0 text-accent" />
          </Link>
        </SystemWindowContent>
      </SystemWindow>

      {/*
        This used to be a line of copy telling them to "reply to your coach's
        last message" — and /messages redirects anybody who isn't entitled
        straight back to this page, so there was no reply to send and no
        screen to send it from. The instruction was impossible to follow, on
        the first screen most new signups ever see.
      */}
      <SystemWindow title="Ask your coach" plain>
        <SystemWindowContent className="flex flex-col gap-3 pt-3">
          {thread.length > 0 && (
            <ul className="flex flex-col gap-2">
              {thread.map((m) => (
                <li
                  key={m.id}
                  className={cn(
                    'max-w-[85%] px-3 py-2 text-sm',
                    m.senderId === user.id
                      ? 'self-end bg-secondary/50'
                      : 'self-start border border-accent/30 bg-accent/[0.07]'
                  )}
                >
                  {m.body ??
                    (m.attachments.some((a) => a.type === 'voice')
                      ? 'Sent a voice message — open Messages to play it'
                      : 'Sent an attachment')}
                </li>
              ))}
            </ul>
          )}
          <Composer action={sendMessageToCoach} placeholder="Anything you need?" className="pt-1" />
        </SystemWindowContent>
      </SystemWindow>

      <div className="max-w-xs">
        <SignOutButton />
      </div>
    </div>
  );
}

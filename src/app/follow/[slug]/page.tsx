import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Check } from 'lucide-react';
import { SystemWindow, SystemWindowContent } from '@/components/ui/system-window';
import { getCurrentUser } from '@/lib/auth';
import { getOfferBySlug } from '@/lib/program-offer';
import { FollowForm, VisitBeacon } from './follow-form';

/*
  The bio link.

  Everything a 15-year-old scrolling past needs to decide, on one phone
  screen: whose program it is, what the week looks like, what it costs, and
  that they can stop whenever they want. Then one form.

  Public on purpose — the middleware only guards /coach and the client app's
  own sections, so this renders for somebody with no account at all.
*/

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const offer = await getOfferBySlug(params.slug).catch(() => null);
  if (!offer) return { title: 'ARISE' };
  return {
    title: `${offer.title} · ARISE`,
    description: offer.pitch ?? 'Train on my exact split, every day, in the ARISE app.',
  };
}

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

export default async function FollowPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams?: { cancelled?: string };
}) {
  const offer = await getOfferBySlug(params.slug);
  if (!offer || !offer.active) notFound();

  const user = await getCurrentUser().catch(() => null);
  const client = user?.clientRecord ?? null;

  const price = Number(offer.plan.price);
  const priceLabel = `${money(price)}/mo`;
  const coachName = offer.coach.profile?.fullName ?? 'Coach';
  const firstName = coachName.split(' ')[0];

  const byWeekday = new Map(offer.template.programDays.map((d) => [d.weekday, d]));
  const sessions = offer.template.programDays.filter((d) => d.kind === 'workout').length;
  const steps = offer.template.programDays.find((d) => d.stepTarget)?.stepTarget ?? null;

  /*
    Who is looking decides what the bottom of the page is. A member already
    training gets a door into the app, a coaching client is told they already
    have it, and everybody else gets the form — with the account fields only
    when there is no account.
  */
  const isActiveMember = client?.tier === 'program' && client.status === 'active';
  const isCoached = Boolean(
    user &&
      (user.role !== 'client' ||
        (client &&
          client.tier !== 'program' &&
          !['lead', 'payment_pending', 'cancelled'].includes(client.status)))
  );

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div aria-hidden className="viewport-frame" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[60vh] bg-[radial-gradient(ellipse_90%_100%_at_50%_0%,hsl(var(--system)/0.28),transparent_70%)]"
      />

      <VisitBeacon offerId={offer.id} />

      <div className="relative mx-auto flex w-full max-w-md flex-col gap-6 px-5 pb-16 pt-12">
        <header className="flex flex-col gap-3">
          <p className="readout text-[11px] uppercase tracking-[0.2em] text-accent">ARISE</p>
          <h1 className="text-3xl font-bold leading-tight">{offer.title}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {offer.pitch ??
              `The exact split ${firstName} used to build his physique — every session, set and rep, on your calendar every day.`}
          </p>
          <p className="readout text-sm">
            <span className="text-2xl font-semibold text-foreground">{money(price)}</span>
            <span className="text-muted-foreground"> / month · cancel anytime</span>
          </p>
        </header>

        <SystemWindow title="Your week" meta={sessions ? `[${sessions} sessions]` : undefined}>
          <SystemWindowContent className="pt-3">
            <ul className="flex flex-col divide-y divide-border/50">
              {DAY_NAMES.map((name, i) => {
                const day = byWeekday.get(i + 1);
                const label =
                  day?.kind === 'workout'
                    ? day.workout?.name ?? 'Workout'
                    : day?.kind === 'cardio'
                      ? day.label ?? 'Cardio'
                      : 'Rest';
                const minutes = day?.kind === 'workout' ? day.workout?.estMinutes : null;
                return (
                  <li key={name} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="readout w-10 text-[11px] uppercase text-muted-foreground">
                      {name}
                    </span>
                    <span
                      className={
                        day?.kind === 'workout' ? 'flex-1 text-foreground' : 'flex-1 text-muted-foreground'
                      }
                    >
                      {label}
                    </span>
                    {minutes ? (
                      <span className="readout text-[11px] text-muted-foreground">{minutes} min</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </SystemWindowContent>
        </SystemWindow>

        <ul className="flex flex-col gap-2.5 text-sm">
          {[
            'Today’s workout waiting for you every time you open the app',
            'Every set, rep and weight laid out — log it and watch your PRs climb',
            steps ? `A ${steps.toLocaleString('en-US')}-step target every day` : null,
            'Achievements and a consistency leaderboard against everyone else on the split',
            'Cancel anytime from your profile — no contract',
          ]
            .filter(Boolean)
            .map((line) => (
              <li key={line} className="flex items-start gap-2.5">
                <Check size={15} className="mt-0.5 shrink-0 text-accent" />
                <span>{line}</span>
              </li>
            ))}
        </ul>

        {searchParams?.cancelled && !isActiveMember && (
          <p className="border border-border/70 bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
            No payment was taken. Your account is saved — subscribe whenever you&apos;re ready.
          </p>
        )}

        <SystemWindow title={isActiveMember ? "You're in" : 'Start today'}>
          <SystemWindowContent className="pt-4">
            {isActiveMember ? (
              <div className="flex flex-col gap-3 text-sm">
                <p className="text-muted-foreground">You&apos;re already on the split.</p>
                <Link
                  href="/today"
                  className="inline-flex h-11 items-center justify-center bg-accent px-6 text-sm font-medium text-accent-foreground"
                >
                  Open today&apos;s workout
                </Link>
              </div>
            ) : isCoached ? (
              <div className="flex flex-col gap-3 text-sm">
                <p className="text-muted-foreground">
                  You&apos;re signed in with an account that already has its own program — no need to
                  subscribe.
                </p>
                <Link href="/" className="text-accent hover:underline">
                  Go to your app
                </Link>
              </div>
            ) : (
              <FollowForm
                slug={offer.slug}
                mode={user ? 'signed-in' : 'new'}
                needsBirthDate={!client?.birthDate}
                priceLabel={priceLabel}
              />
            )}
          </SystemWindowContent>
        </SystemWindow>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Billed {money(price)} every month until you cancel. Cancel anytime from your profile and you
          keep access until the end of the month you paid for. You must be 13 or older to join.
          {!user && (
            <>
              {' '}
              Already have an account?{' '}
              <Link
                href={`/login?next=${encodeURIComponent(`/follow/${offer.slug}`)}`}
                className="text-accent hover:underline"
              >
                Sign in
              </Link>
              .
            </>
          )}
        </p>

        <nav className="flex gap-6">
          <Link href="/privacy" className="readout text-[10px] uppercase text-muted-foreground hover:text-accent">
            Privacy
          </Link>
          <Link href="/terms" className="readout text-[10px] uppercase text-muted-foreground hover:text-accent">
            Terms
          </Link>
        </nav>
      </div>
    </div>
  );
}

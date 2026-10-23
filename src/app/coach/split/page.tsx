import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';
import { getSiteUrl } from '@/lib/site-url';
import { todayIn, zoneOf } from '@/lib/day';
import { conversionPercent, isMinor } from '@/lib/membership';
import { SystemWindow, SystemWindowContent } from '@/components/ui/system-window';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CopyLink, OfferForm } from '@/components/coach/offer-forms';
import { STATUS_LABELS } from '@/lib/client-status';
import {
  changeOfferPrice,
  createOffer,
  refreshCalendars,
  setOfferOpen,
  updateOffer,
} from './actions';

/*
  Follow My Split, from the coach's side.

  Three questions, top to bottom: is the page live and where is it; is the
  price working (looks → members, the 30-day check); and who is on it. Setup
  is the same screen before an offer exists, so there is nowhere else to go
  looking for it.
*/

export const dynamic = 'force-dynamic';

const field =
  'flex h-11 w-full border border-input bg-secondary/40 px-4 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const area =
  'flex min-h-[84px] w-full border border-input bg-secondary/40 px-4 py-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const DAY = 24 * 60 * 60 * 1000;

function money(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function FollowMySplitPage() {
  const coach = await requireCoach();
  const siteUrl = getSiteUrl();
  const today = todayIn(zoneOf(coach.profile));

  const [offer, templates] = await Promise.all([
    prisma.programOffer.findFirst({
      where: { coachId: coach.id },
      orderBy: { createdAt: 'desc' },
      include: { plan: true, template: { select: { id: true, name: true } } },
    }),
    prisma.workoutTemplate.findMany({
      where: { coachId: coach.id },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, _count: { select: { programDays: true } } },
      take: 200,
    }),
  ]);

  const programOptions = templates.filter((t) => t._count.programDays > 0);

  if (!offer) {
    const firstName = (coach.profile?.fullName ?? '').split(' ')[0]?.toLowerCase() || 'my-split';
    return (
      <div className="flex max-w-2xl flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold">Follow My Split</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A public page anyone 13+ can subscribe on. Paying puts them straight onto your program —
            no invite, no agreement, nothing for you to do. They can cancel anytime from their
            profile.
          </p>
        </header>

        {programOptions.length === 0 ? (
          <SystemWindow title="First, the program">
            <SystemWindowContent className="pt-4 text-sm text-muted-foreground">
              Build your split first, with every day of the week set, then come back here.{' '}
              <Link href="/coach/programs" className="text-accent hover:underline">
                Open Programs
              </Link>
            </SystemWindowContent>
          </SystemWindow>
        ) : (
          <SystemWindow title="Set it up">
            <SystemWindowContent className="pt-4">
              <OfferForm action={createOffer} submitLabel="Create the price in Stripe and go live" pendingLabel="Setting up…">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="title">Name</Label>
                  <Input id="title" name="title" defaultValue="Train on my split" required />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="templateId">Program</Label>
                  <select id="templateId" name="templateId" className={field} required defaultValue={programOptions[0]?.id}>
                    {programOptions.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="price">Price per month ($)</Label>
                    <Input id="price" name="price" inputMode="decimal" defaultValue="16.99" required />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="slug">Page address</Label>
                    <Input id="slug" name="slug" defaultValue={firstName} required />
                  </div>
                </div>
                <p className="readout text-[11px] text-muted-foreground">
                  Your page will be {siteUrl}/follow/<span className="text-foreground">[address]</span>
                </p>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="pitch">One line under the name (optional)</Label>
                  <textarea
                    id="pitch"
                    name="pitch"
                    className={area}
                    placeholder="The exact split I used to build my physique — every session, set and rep, on your calendar every day."
                  />
                </div>
              </OfferForm>
            </SystemWindowContent>
          </SystemWindow>
        )}
      </div>
    );
  }

  const url = `${siteUrl}/follow/${offer.slug}`;
  const since = new Date(today.getTime() - 29 * DAY);

  const [visitorRows, started30, paid30, payingNow, members] = await Promise.all([
    prisma.offerVisit.findMany({
      where: { offerId: offer.id, day: { gte: since } },
      distinct: ['visitor'],
      select: { visitor: true },
    }),
    prisma.client.count({ where: { offerId: offer.id, tier: 'program', createdAt: { gte: since } } }),
    // startDate is written once, on someone's first payment.
    prisma.client.count({ where: { offerId: offer.id, tier: 'program', startDate: { gte: since } } }),
    prisma.client.count({ where: { offerId: offer.id, tier: 'program', status: 'active' } }),
    prisma.client.findMany({
      where: { offerId: offer.id, tier: 'program', status: { in: ['active', 'cancelled'] } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        userId: true,
        status: true,
        birthDate: true,
        startDate: true,
        user: { select: { email: true, profile: { select: { fullName: true } } } },
        subscriptions: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { cancelAtPeriodEnd: true },
        },
      },
    }),
  ]);

  const visitors = visitorRows.length;
  const conversion = conversionPercent(visitors, paid30);
  const price = Number(offer.plan.price);
  const teens = members.filter((m) => m.status === 'active' && isMinor(m.birthDate, today)).length;

  const verdict =
    conversion === null || visitors < 100
      ? 'Too early to judge the price — wait for at least 100 visitors.'
      : conversion < 3
        ? 'Under 3%: lots of looks, few buyers. The price is the likely blocker — try lowering it for new members.'
        : conversion <= 6
          ? 'Between 3% and 6%: the price is working. Keep it.'
          : 'Over 6%: people are buying easily. Hold the price, and consider a yearly plan.';

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Follow My Split</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {offer.title} · {money(price)}/month · {offer.template.name}
          </p>
        </div>
        <form action={setOfferOpen}>
          <input type="hidden" name="offerId" value={offer.id} />
          <input type="hidden" name="open" value={offer.active ? 'false' : 'true'} />
          <button
            type="submit"
            className={
              offer.active
                ? 'readout border border-success/50 bg-success/10 px-3 py-2 text-[10px] uppercase text-success'
                : 'readout border border-border px-3 py-2 text-[10px] uppercase text-muted-foreground'
            }
          >
            {offer.active ? 'Live — tap to close signups' : 'Closed — tap to open signups'}
          </button>
        </form>
      </header>

      <SystemWindow title="Your page">
        <SystemWindowContent className="flex flex-col gap-2 pt-4">
          <CopyLink url={url} />
          <p className="text-xs text-muted-foreground">Put this in your bio. Anyone 13+ can subscribe from it.</p>
        </SystemWindowContent>
      </SystemWindow>

      <SystemWindow title="Last 30 days">
        <SystemWindowContent className="flex flex-col gap-4 pt-4">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {[
              { label: 'Visitors', value: visitors.toLocaleString('en-US') },
              { label: 'Started signup', value: started30.toLocaleString('en-US') },
              { label: 'Paid', value: paid30.toLocaleString('en-US') },
              { label: 'Conversion', value: conversion === null ? '—' : `${conversion}%` },
              { label: 'Members now', value: payingNow.toLocaleString('en-US') },
            ].map((s) => (
              <div key={s.label}>
                <dt className="readout text-[10px] uppercase text-muted-foreground">{s.label}</dt>
                <dd className="readout mt-1 text-xl text-foreground">{s.value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm">
            About <span className="font-semibold text-accent">{money(payingNow * price)}</span> a month
            from {payingNow} member{payingNow === 1 ? '' : 's'}
            {teens > 0 ? ` (${teens} under 18)` : ''}, before Stripe&apos;s fee.
          </p>
          <p className="border border-border/70 bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
            {verdict}
          </p>
        </SystemWindowContent>
      </SystemWindow>

      <div className="grid gap-6 lg:grid-cols-2">
        <SystemWindow title="Edit">
          <SystemWindowContent className="pt-4">
            <OfferForm action={updateOffer} submitLabel="Save" pendingLabel="Saving…">
              <input type="hidden" name="offerId" value={offer.id} />
              <div className="flex flex-col gap-2">
                <Label htmlFor="title">Name</Label>
                <Input id="title" name="title" defaultValue={offer.title} required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="templateId">Program</Label>
                <select id="templateId" name="templateId" className={field} defaultValue={offer.templateId}>
                  {programOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="pitch">One line under the name</Label>
                <textarea id="pitch" name="pitch" className={area} defaultValue={offer.pitch ?? ''} />
              </div>
            </OfferForm>
          </SystemWindowContent>
        </SystemWindow>

        <div className="flex flex-col gap-6">
          <SystemWindow title="Price">
            <SystemWindowContent className="pt-4">
              <OfferForm
                action={changeOfferPrice}
                submitLabel="Change price for new members"
                pendingLabel="Creating the new price…"
                variant="outline"
              >
                <input type="hidden" name="offerId" value={offer.id} />
                <div className="flex flex-col gap-2">
                  <Label htmlFor="price">New monthly price ($)</Label>
                  <Input id="price" name="price" inputMode="decimal" defaultValue={price.toFixed(2)} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Current members keep the price they joined at.
                </p>
              </OfferForm>
            </SystemWindowContent>
          </SystemWindow>

          <SystemWindow title="Changed your split?">
            <SystemWindowContent className="pt-4">
              <OfferForm
                action={refreshCalendars}
                submitLabel="Update everyone's calendar"
                pendingLabel="Updating calendars…"
                variant="outline"
              >
                <input type="hidden" name="offerId" value={offer.id} />
                <p className="text-xs text-muted-foreground">
                  Rewrites every member&apos;s calendar from today with the program as it is now.
                  Finished workouts stay where they were done.
                </p>
              </OfferForm>
            </SystemWindowContent>
          </SystemWindow>
        </div>
      </div>

      <SystemWindow title="Members" meta={`[${members.length}]`}>
        <SystemWindowContent className="pt-3">
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody yet. Share the link.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border/50">
              {members.map((m) => {
                const name = m.user.profile?.fullName || m.user.email;
                const ending = m.subscriptions[0]?.cancelAtPeriodEnd;
                return (
                  <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <Link href={`/coach/clients/${m.userId}`} className="hover:text-accent">
                      {name}
                    </Link>
                    <span className="readout text-[11px] text-muted-foreground">
                      {isMinor(m.birthDate, today) ? '13–17' : '18+'} ·{' '}
                      {m.status === 'active' && ending ? 'Ending' : STATUS_LABELS[m.status]}
                      {m.startDate
                        ? ` · since ${m.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`
                        : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </SystemWindowContent>
      </SystemWindow>
    </div>
  );
}

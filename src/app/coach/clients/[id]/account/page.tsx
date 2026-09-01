import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Pin, FileText } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CopyLinkButton } from '@/components/copy-link-button';
import { IntakeCard } from '@/components/onboarding/intake-card';
import { BillingCard } from '@/components/coach/billing-card';
import { cn } from '@/lib/utils';
import { CLIENT_STATUSES, STATUS_LABELS } from '@/lib/client-status';
import { PROVIDER_LABELS } from '@/lib/plans';
import { updateClientStatus, addCoachNote, toggleCoachNotePin } from '../actions';
import {
  createPaymentLink,
  markPaymentLinkPaid,
  cancelPaymentLink,
  recheckClientPayments,
} from '../payment-actions';

const selectClass =
  'flex h-11 w-full rounded-xl border border-input bg-secondary/40 px-4 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/*
  Account — where they stand with you rather than what they are training.
  Status, the notes only you see, money, the agreement, and their intake.
*/
export default async function ClientAccountPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { checked?: string };
}) {
  const client = await prisma.client.findUnique({
    where: { userId: params.id },
    include: {
      user: { include: { profile: true } },
      coachNotes: { orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }] },
      agreements: { orderBy: { createdAt: 'desc' }, take: 1 },
      paymentLinks: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });

  if (!client) notFound();

  const [plans, templates, pendingStripeLinks] = await Promise.all([
    prisma.plan.findMany({ where: { active: true }, orderBy: { createdAt: 'desc' } }),
    prisma.agreementTemplate.findMany({ orderBy: { isDefault: 'desc' } }),
    /*
      Every unpaid Stripe link on this client, not just the newest one shown
      below. A client who paid a link that never came back usually has a second
      link by the time anyone notices, because generating a fresh one is the
      obvious first thing to try — and the money is on the older one.
    */
    prisma.paymentLink.findMany({
      where: { clientId: params.id, provider: 'stripe', status: 'pending' },
      select: { id: true },
    }),
  ]);

  const latestAgreement = client.agreements[0] ?? null;
  const latestLink = client.paymentLinks[0] ?? null;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {CLIENT_STATUSES.map((status) => {
              const isCurrent = status === client.status;
              return (
                <form key={status} action={updateClientStatus}>
                  <input type="hidden" name="clientId" value={client.userId} />
                  <input type="hidden" name="status" value={status} />
                  <button
                    type="submit"
                    disabled={isCurrent}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-all',
                      isCurrent
                        ? 'cursor-default bg-accent text-accent-foreground ring-accent'
                        : 'bg-secondary/50 text-muted-foreground ring-border hover:bg-secondary hover:text-foreground hover:ring-accent/30'
                    )}
                  >
                    {STATUS_LABELS[status]}
                  </button>
                </form>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Coach Notes</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <form action={addCoachNote} className="flex flex-col gap-3">
            <input type="hidden" name="clientId" value={client.userId} />
            <textarea
              name="body"
              required
              rows={3}
              placeholder="Add a note about this client…"
              className="w-full resize-none rounded-xl border border-border bg-secondary/30 p-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button type="submit" size="sm" className="self-end">
              Add Note
            </Button>
          </form>

          {client.coachNotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notes yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {client.coachNotes.map((note) => (
                <li
                  key={note.id}
                  className={cn(
                    'rounded-xl border p-4',
                    note.pinned ? 'border-accent/30 bg-accent/5' : 'border-border bg-secondary/20'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm leading-relaxed">{note.body}</p>
                    <form action={toggleCoachNotePin}>
                      <input type="hidden" name="noteId" value={note.id} />
                      <input type="hidden" name="clientId" value={client.userId} />
                      <input type="hidden" name="pinned" value={String(note.pinned)} />
                      <button
                        type="submit"
                        title={note.pinned ? 'Unpin note' : 'Pin note'}
                        className={cn(
                          'shrink-0 transition-colors',
                          note.pinned ? 'text-accent' : 'text-muted-foreground hover:text-accent'
                        )}
                      >
                        <Pin size={15} fill={note.pinned ? 'currentColor' : 'none'} />
                      </button>
                    </form>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {note.createdAt.toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment & Agreement</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {/*
            These used to be one ternary chain, which meant the generate-link
            form was unreachable the moment any agreement existed — so a
            second term, a renewal or a price change could not be sent at all
            from the console. They are separate blocks now: the agreement and
            any live link are shown, and the form is always underneath them.
          */}
          {latestAgreement && (
            <Link
              href={`/agreement/${latestAgreement.id}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/20 px-4 py-3 transition-colors hover:bg-secondary/40"
            >
              <div className="flex items-center gap-3">
                <FileText size={18} className="text-accent" />
                <div>
                  <p className="text-sm font-medium">
                    {latestAgreement.status === 'signed' ? 'Signed Agreement' : 'Agreement Awaiting Signature'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    ${Number(latestAgreement.price).toLocaleString('en-US', { minimumFractionDigits: 2 })} ·{' '}
                    {latestAgreement.termMonths} mo
                  </p>
                </div>
              </div>
              <Badge variant={latestAgreement.status === 'signed' ? 'success' : 'accent'}>
                {latestAgreement.status === 'signed' ? 'Signed' : 'Pending'}
              </Badge>
            </Link>
          )}

          {latestLink && latestLink.status === 'pending' && (
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-secondary/20 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Payment link sent</p>
                <Badge variant="outline">{PROVIDER_LABELS[latestLink.provider]} · pending</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Input readOnly value={latestLink.checkoutUrl} className="flex-1 text-xs" />
                <CopyLinkButton url={latestLink.checkoutUrl} />
              </div>
              {latestLink.provider === 'fanbasis' && (
                <form action={markPaymentLinkPaid}>
                  <input type="hidden" name="paymentLinkId" value={latestLink.id} />
                  <input type="hidden" name="clientId" value={client.userId} />
                  <Button type="submit" size="sm" variant="secondary">
                    Mark as Paid
                  </Button>
                </form>
              )}


              {/* A link he no longer wants live. Cancelling it stops it being
                  payable and clears the way for a fresh one. */}
              <form action={cancelPaymentLink}>
                <input type="hidden" name="paymentLinkId" value={latestLink.id} />
                <input type="hidden" name="clientId" value={client.userId} />
                <button
                  type="submit"
                  className="readout self-start text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-destructive"
                >
                  Cancel this link
                </button>
              </form>
            </div>
          )}

          {/*
            The way out of "I already paid".

            A Stripe payment that never came back — a webhook that didn't
            arrive, or a client who closed the tab before the success page
            could finish — left the link pending with no agreement and nothing
            in the console able to fix it; "Mark as Paid" only ever appeared
            for FanBasis. This asks Stripe directly, across every unpaid link
            on the client, so it can only ever confirm a payment that really
            happened — somebody who has not paid stays exactly as they are.
          */}
          {pendingStripeLinks.length > 0 && (
            <form action={recheckClientPayments} className="flex flex-col gap-1.5">
              <input type="hidden" name="clientId" value={client.userId} />
              <Button type="submit" size="sm" variant="secondary" className="self-start">
                They say they paid — check Stripe
              </Button>
              {searchParams?.checked === 'paid' ? (
                <p className="readout text-[11px] uppercase text-[hsl(var(--accent))]">
                  Found it. Their payment is recorded and the agreement is waiting on their
                  signature.
                </p>
              ) : searchParams?.checked === 'none' ? (
                <p className="readout text-[11px] uppercase text-muted-foreground">
                  Stripe has no completed payment on{' '}
                  {pendingStripeLinks.length === 1 ? 'their link' : 'any of their links'} yet.
                </p>
              ) : searchParams?.checked === 'error' ? (
                <p className="readout text-[11px] uppercase text-[hsl(var(--destructive))]">
                  Couldn&apos;t reach Stripe just then — try again in a moment.
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Checks Stripe and finishes their agreement if the payment went through.
                </p>
              )}
            </form>
          )}

          {plans.length === 0 || templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Set up at least one{' '}
              <Link href="/coach/payments" className="text-accent hover:underline">
                coaching plan and agreement template
              </Link>{' '}
              before sending a payment link.
            </p>
          ) : (
            <form action={createPaymentLink} className="flex flex-col gap-3">
              <input type="hidden" name="clientId" value={client.userId} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <select name="planId" className={selectClass} required defaultValue="">
                  <option value="" disabled>
                    Choose a plan…
                  </option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} — ${Number(plan.price).toLocaleString('en-US')}
                      {plan.stripePriceId ? ' (Stripe price)' : ''}
                    </option>
                  ))}
                </select>
                <select name="agreementTemplateId" className={selectClass} required defaultValue={templates.find((t) => t.isDefault)?.id ?? ''}>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
                <select name="provider" className={selectClass} required defaultValue="stripe">
                  <option value="stripe">Stripe</option>
                  <option value="fanbasis">FanBasis</option>
                </select>
                <Input name="startDate" type="date" required />
                {/* Ignored for a plan backed by a Stripe price — Stripe owns that
                    amount, and the agreement has to say the same number the card
                    is actually charged. See payment-actions.ts. */}
                <Input name="priceOverride" type="number" step="0.01" min="0" placeholder="Override price ($, ARISE-priced plans only)" />
                <Input name="termMonthsOverride" type="number" min="1" placeholder="Override duration (months, optional)" />
                {/*
                  On a fixed payment plan this is the number that ends the
                  billing — when this many payments have gone through, the
                  subscription is cancelled at Stripe. Leave it blank to use
                  whatever the plan says.
                */}
                <Input
                  name="numberOfPaymentsOverride"
                  type="number"
                  min="1"
                  placeholder="Override number of payments (optional)"
                />
                <Input
                  name="manualCheckoutUrl"
                  placeholder="FanBasis checkout link (FanBasis only)"
                  className="sm:col-span-2"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Stripe links are generated automatically, and a payment plan stops billing on its
                own once the agreed number of payments has gone through. Plans marked{' '}
                <span className="text-foreground">(Stripe price)</span> charge the exact price you
                set up in Stripe, so the override box above does not apply to them. For FanBasis, paste the
                checkout link you created in FanBasis&apos;s own dashboard — FanBasis has no API
                integration here yet, so those payments are confirmed by hand.
              </p>
              <Button type="submit" size="sm" className="w-fit">
                Generate Payment Link
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* What they have actually paid — see components/coach/billing-card.tsx. */}
      <BillingCard clientId={client.userId} />

      <IntakeCard clientId={client.userId} />
    </div>
  );
}

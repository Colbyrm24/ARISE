import { AlertTriangle, Check, RotateCw } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { requiredPayments, paymentsRemaining } from '@/lib/billing';
import { contractProgress, chargesRemaining, contractOverrunning } from '@/lib/contract';
import { PROVIDER_LABELS } from '@/lib/plans';
import {
  endBillingNow,
  endBillingAtPeriodEnd,
  keepBillingRunning,
} from '@/app/coach/clients/[id]/subscription-actions';

/*
  What this client has actually paid.

  Payments were being written and never read anywhere. A coach could see that
  a payment link had been sent and that an agreement existed, and nothing
  else: no history, no receipts, no idea whether a recurring charge had gone
  through last month or quietly started declining. The dashboard's "failed
  payments" tile read zero because no code path could write a failed payment
  at all.

  Self-fetching so the account page only has to drop it in. Access is gated
  by the coach layout, and the id comes from the coach's own client list.
*/

const money = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/*
  The client's date, not the host's.

  These are DateTime instants — a Stripe period end, a paidAt — and they were
  formatted with no timeZone, which on Vercel is UTC. A subscription Stripe
  renews at 8pm Eastern on 3 March read "next charge Mar 4" here, and the
  client's own billing line (which does pass their zone) said Mar 3. Two
  screens in the same app disagreeing about when money moves.
*/
const when = (d: Date | null, timeZone: string) =>
  d
    ? d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone,
      })
    : '—';

const STATUS_COPY: Record<string, { label: string; variant: 'success' | 'accent' | 'outline' }> = {
  active: { label: 'Billing', variant: 'success' },
  past_due: { label: 'Card declining', variant: 'accent' },
  completed: { label: 'Paid in full', variant: 'outline' },
  canceled: { label: 'Cancelled', variant: 'outline' },
};

export async function BillingCard({
  clientId,
  timeZone,
}: {
  clientId: string;
  timeZone: string;
}) {
  /*
    The totals are asked for as totals, not filtered out of the visible list.

    Every number on this card used to be derived from the newest 24 payment
    rows — the same rows drawn in the history below — which made all of them
    silently wrong the moment a client crossed 24 payments:

      · "collected over N payments" froze, understating lifetime revenue for
        anybody on a weekly plan past about six months
      · the per-subscription count fell as older payments aged out, so a
        client who FINISHED a 12-payment plan and started a second one read
        "11 of 12 · 1 to go" with an unfilled bar — the console telling the
        coach a fully-paid client still owed him
      · a declined card stopped raising the banner once 24 newer rows sat on
        top of its failure, while the dashboard tile went on counting it

    A count and a sum are one round trip each and stay right forever. `take`
    now belongs only to the list it was written for.
  */
  const [
    subscriptions,
    payments,
    succeededAgg,
    failingCount,
    paidPerSub,
    paidPerLink,
    contractAgreements,
  ] = await Promise.all([
    prisma.subscription.findMany({
      where: { clientId, deletedAt: null },
      include: { plan: true, paymentLink: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.payment.findMany({
      where: { clientId, deletedAt: null },
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
      take: 24,
    }),
    prisma.payment.aggregate({
      where: { clientId, deletedAt: null, status: 'succeeded' },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.payment.count({ where: { clientId, deletedAt: null, status: 'failed' } }),
    prisma.payment.groupBy({
      by: ['subscriptionId'],
      where: { clientId, deletedAt: null, status: 'succeeded', subscriptionId: { not: null } },
      _count: { _all: true },
      // Summed here as well as counted, because a contract is measured in
      // dollars rather than in charges — a client who sends an extra $1,000
      // has moved through their total without adding to the count.
      _sum: { amount: true },
    }),
    /*
      The first charge, which belongs to the link rather than to the
      subscription. finalizeStripeSession writes it with `paymentLinkId` set
      and `subscriptionId` null (the subscription row does not exist yet at
      that point), so a contract measured only through the subscription would
      permanently understate itself by exactly one payment.
    */
    prisma.payment.groupBy({
      by: ['paymentLinkId'],
      where: { clientId, deletedAt: null, status: 'succeeded', paymentLinkId: { not: null } },
      _sum: { amount: true },
    }),
    /*
      What this client actually signed up to pay in total, per contract.

      Read off the agreement rather than the plan: the plan's figure is
      editable and the payment link's override can be superseded by a later
      link, while this row is the frozen record of the deal. Agreements with
      no total are plans that state their end in payments, and there is
      nothing here to show for them.
    */
    prisma.agreement.findMany({
      where: { clientId, deletedAt: null, contractTotal: { not: null } },
      select: { id: true, paymentLinkId: true, contractTotal: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const succeededCount: number = succeededAgg?._count?._all ?? 0;
  const collected = Number(succeededAgg?._sum?.amount ?? 0);

  if (subscriptions.length === 0 && payments.length === 0 && succeededCount === 0) return null;

  // Counted per subscription rather than over the whole list, so a client on
  // their second plan doesn't read as further through it than they are.
  const paidBySubscription = new Map<string, number>();
  const amountBySubscription = new Map<string, number>();
  for (const row of (paidPerSub ?? []) as Array<{
    subscriptionId: string | null;
    _count: { _all: number };
    _sum: { amount: unknown };
  }>) {
    if (!row.subscriptionId) continue;
    paidBySubscription.set(row.subscriptionId, row._count?._all ?? 0);
    amountBySubscription.set(row.subscriptionId, Number(row._sum?.amount ?? 0));
  }

  const amountByLink = new Map<string, number>();
  for (const row of (paidPerLink ?? []) as Array<{
    paymentLinkId: string | null;
    _sum: { amount: unknown };
  }>) {
    if (!row.paymentLinkId) continue;
    amountByLink.set(row.paymentLinkId, Number(row._sum?.amount ?? 0));
  }

  /*
    Everything paid against one contract: the signup charge, which is filed
    under the payment link, plus every renewal, which is filed under the
    subscription that link created.

    Keyed by payment link because that is the one id both the agreement and
    the subscription hold. An agreement with no link — the "they already pay
    me elsewhere" migration path — has no contract to measure, and asking for
    payments with a null link would sweep in every unrelated charge on the
    account, so those are skipped rather than guessed at.
  */
  const paidTowardLink = (linkId: string) => {
    let total = amountByLink.get(linkId) ?? 0;
    for (const sub of subscriptions) {
      if (sub.paymentLinkId === linkId) total += amountBySubscription.get(sub.id) ?? 0;
    }
    return total;
  };

  type ContractRow = {
    id: string;
    linkId: string;
    total: number;
    progress: NonNullable<ReturnType<typeof contractProgress>>;
  };

  const contracts: ContractRow[] = [];
  for (const a of (contractAgreements ?? []) as Array<{
    id: string;
    paymentLinkId: string | null;
    contractTotal: unknown;
  }>) {
    if (!a.paymentLinkId) continue;
    const total = Number(a.contractTotal ?? 0);
    const progress = contractProgress(total, paidTowardLink(a.paymentLinkId));
    if (!progress) continue;
    contracts.push({ id: a.id, linkId: a.paymentLinkId, total, progress });
  }
  const contractByLink = new Map(contracts.map((c) => [c.linkId, c]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-baseline gap-3">
          <span className="readout text-2xl text-accent glow-soft">{money(collected)}</span>
          <span className="text-sm text-muted-foreground">
            collected over {succeededCount} {succeededCount === 1 ? 'payment' : 'payments'}
          </span>
        </div>

        {failingCount > 0 && (
          <p className="flex items-center gap-2 border border-destructive/40 bg-destructive/[0.07] px-4 py-3 text-sm">
            <AlertTriangle size={15} className="shrink-0 text-destructive" />
            {failingCount === 1
              ? 'A payment failed. Their card was declined.'
              : `${failingCount} payments failed. Their card is being declined.`}
          </p>
        )}

        {subscriptions.map((sub) => {
          const required = requiredPayments({
            billingType: sub.plan.billingType,
            numberOfPayments:
              sub.paymentLink?.numberOfPaymentsOverride ?? sub.plan.numberOfPayments,
          });
          const paid = paidBySubscription.get(sub.id) ?? 0;
          const left = paymentsRemaining(paid, required);
          const copy = STATUS_COPY[sub.status] ?? STATUS_COPY.active!;
          const contract = sub.paymentLinkId ? contractByLink.get(sub.paymentLinkId) : undefined;
          const overrunning = contractOverrunning(contract?.progress ?? null, sub);
          // The price this client is actually charged, not the plan's list
          // price — an override is exactly the case where the two differ, and
          // "6 charges to go" computed off the wrong one is worse than silence.
          const charges = contract
            ? chargesRemaining(
                contract.progress.remaining,
                Number(sub.paymentLink?.priceOverride ?? sub.plan.price)
              )
            : null;

          return (
            <div key={sub.id} className="flex flex-col gap-2 border border-border px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">{sub.plan.name}</p>
                <Badge variant={copy.variant}>{copy.label}</Badge>
              </div>

              <p className="text-xs text-muted-foreground">
                {required === null ? (
                  <>
                    Ongoing · {paid} {paid === 1 ? 'payment' : 'payments'} so far
                  </>
                ) : (
                  <>
                    {paid} of {required} payments
                    {left && left > 0 ? ` · ${left} to go` : ' · complete'}
                  </>
                )}
                {sub.currentPeriodEnd && sub.status === 'active' && !sub.cancelAtPeriodEnd && (
                  <> · next charge {when(sub.currentPeriodEnd, timeZone)}</>
                )}
              </p>

              {/*
                Progress against the total they signed for.

                A rolling plan has no payment count to run out, so the line
                above can only ever say "ongoing · 7 payments so far" — true,
                and useless for the one question the agreement now answers:
                how much of the $4,500 is left. That figure was captured, put
                into the contract, and then read by nothing.
              */}
              {contract && (
                <div className="flex flex-col gap-1.5 pt-1">
                  <p className="text-xs text-muted-foreground">
                    <span className="text-foreground">{money(contract.progress.paid)}</span> of{' '}
                    {money(contract.total)} contract
                    {contract.progress.met
                      ? ' · paid in full'
                      : ` · ${money(contract.progress.remaining)} left${
                          charges ? ` · about ${charges} more ${charges === 1 ? 'charge' : 'charges'}` : ''
                        }`}
                  </p>
                  <div
                    className="h-1 w-full bg-secondary/60"
                    role="img"
                    aria-label={`${money(contract.progress.paid)} of ${money(contract.total)} paid`}
                  >
                    <div
                      className={contract.progress.met ? 'h-full bg-success' : 'h-full bg-accent'}
                      style={{ width: `${contract.progress.percent}%` }}
                    />
                  </div>
                </div>
              )}

              {/*
                The one thing the agreement promises that nothing automates.

                requiredPayments() returns null for a rolling subscription, so
                isPaidInFull can never fire and Stripe will keep charging a
                client who has paid every dollar they owe — the exact thing
                Section 3 tells them will not happen. Loud, and next to the
                buttons that stop it, because the only mechanism is him.
              */}
              {overrunning && (
                <p className="flex items-center gap-2 border border-destructive/40 bg-destructive/[0.07] px-4 py-3 text-sm">
                  <AlertTriangle size={15} className="shrink-0 text-destructive" />
                  They&apos;ve paid the full {money(contract!.total)}. Billing is still running —
                  end it below unless you&apos;re re-signing them.
                </p>
              )}

              {/*
                Ending a client used to be a status change that Stripe never
                heard about — they lost the app and their card kept being
                charged. These are the two ways to actually stop it, and they
                only appear while there is billing left to stop.
              */}
              {sub.status === 'active' && sub.providerSubscriptionId && (
                sub.cancelAtPeriodEnd ? (
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <p className="text-xs text-accent">
                      Ends {when(sub.currentPeriodEnd, timeZone)} · no further charges
                    </p>
                    <form action={keepBillingRunning}>
                      <input type="hidden" name="subscriptionId" value={sub.id} />
                      <input type="hidden" name="clientId" value={clientId} />
                      <Button type="submit" variant="ghost" size="sm">
                        Keep it running
                      </Button>
                    </form>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <form action={endBillingAtPeriodEnd}>
                      <input type="hidden" name="subscriptionId" value={sub.id} />
                      <input type="hidden" name="clientId" value={clientId} />
                      <Button type="submit" variant="secondary" size="sm">
                        End when this period runs out
                      </Button>
                    </form>
                    <form action={endBillingNow}>
                      <input type="hidden" name="subscriptionId" value={sub.id} />
                      <input type="hidden" name="clientId" value={clientId} />
                      <Button type="submit" variant="ghost" size="sm">
                        End now
                      </Button>
                    </form>
                    {/* Money already taken for a period they no longer get is
                        a refund, and a refund is issued in Stripe on purpose —
                        it can be partial, and it is the coach's call. */}
                    <p className="text-xs text-muted-foreground">
                      Ending now doesn&apos;t refund the current period.
                    </p>
                  </div>
                )
              )}

              {required !== null && (
                <div
                  className="h-1 w-full bg-secondary/60"
                  role="img"
                  aria-label={`${paid} of ${required} payments made`}
                >
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${Math.min(100, (paid / required) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}

        {/*
          A contract whose payments are not coming through a subscription
          listed above.

          Section 3 of the agreement expects exactly this shape: somebody
          paying a deposit and then one-time installments toward the total,
          with no recurring plan behind it. Rendered inside the subscription
          block when there is one, and here when there isn't, so the figure
          never quietly disappears for the arrangement the contract was
          written to describe.
        */}
        {contracts
          .filter((c) => !subscriptions.some((s) => s.paymentLinkId === c.linkId))
          .map((c) => (
            <div key={c.id} className="flex flex-col gap-2 border border-border px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Contract</p>
                <Badge variant={c.progress.met ? 'success' : 'outline'}>
                  {c.progress.met ? 'Paid in full' : 'Open'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                <span className="text-foreground">{money(c.progress.paid)}</span> of{' '}
                {money(c.total)}
                {c.progress.met ? '' : ` · ${money(c.progress.remaining)} left`}
              </p>
              <div
                className="h-1 w-full bg-secondary/60"
                role="img"
                aria-label={`${money(c.progress.paid)} of ${money(c.total)} paid`}
              >
                <div
                  className={c.progress.met ? 'h-full bg-success' : 'h-full bg-accent'}
                  style={{ width: `${c.progress.percent}%` }}
                />
              </div>
            </div>
          ))}

        {payments.length > 0 && (
          <ul className="flex flex-col">
            {payments.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 border-b border-border/50 py-2 text-sm last:border-b-0"
              >
                {p.status === 'succeeded' ? (
                  <Check size={14} className="shrink-0 text-success" />
                ) : p.status === 'refunded' ? (
                  <RotateCw size={14} className="shrink-0 text-muted-foreground" />
                ) : (
                  <AlertTriangle size={14} className="shrink-0 text-destructive" />
                )}
                <span className="tabular-nums">{money(Number(p.amount))}</span>
                <span className="text-xs text-muted-foreground">
                  {when(p.paidAt ?? p.createdAt, timeZone)}
                </span>
                <span className="readout ml-auto text-[10px] uppercase text-muted-foreground">
                  {p.status === 'succeeded' ? PROVIDER_LABELS[p.provider] : p.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

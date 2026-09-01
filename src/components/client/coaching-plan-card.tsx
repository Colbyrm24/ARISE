import { prisma } from '@/lib/prisma';
import { requiredPayments, paymentsRemaining } from '@/lib/billing';
import { Card, CardContent } from '@/components/ui/card';
import { ManageBillingButton } from '@/components/client/manage-billing-button';

/*
  What a client has bought, told to the client.

  "How many payments have I got left?" is the most common question a coach
  gets that has nothing to do with training, and the answer already existed —
  it is computed and rendered on the coach's billing card, from the same two
  pure functions used here. The client just had no way to see it. Their own
  side of the app mentioned their agreement exactly once, as a status word on
  this screen, and only while it was still unsigned.

  Somebody who can see their own terms does not have to ask, and does not have
  to wonder whether the next charge is a surprise. It also quietly does a
  second job: a person who can see "4 of 6" is looking at how much of the
  thing they paid for is still ahead of them.

  Deliberately no prices per line and no invoice list. This is orientation,
  not a billing statement — the number of payments, the next date, and the
  name of what they are on.
*/

/*
  The client's date, not the server's.

  currentPeriodEnd is an instant from Stripe, and formatting an instant with
  no timeZone uses the host's — UTC on Vercel. A period ending 6pm PDT on
  1 October read "Next payment Oct 2" to the person whose card gets charged
  on the 1st. On the one line in the app that says when money leaves their
  account, being a day out is not a rounding error.
*/
function when(date: Date, timeZone: string) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone });
}

export async function CoachingPlanCard({
  clientId,
  timeZone,
}: {
  clientId: string;
  timeZone: string;
}) {
  /*
    Wrapped, because this is the profile screen and a billing read failing
    must not take down the place somebody goes to change their background or
    sign out.
  */
  /*
    Its own try, deliberately.

    stripe_customer_id is added by a migration applied by hand, so there is a
    window where this code is live and the column is not. Sharing a try with
    the queries below would mean that window hid the whole card — the plan,
    the count, all of it — over a button nobody can use yet. Alone, a missing
    column just means no button.
  */
  let hasBilling = false;
  try {
    const billing = await prisma.client.findUnique({
      where: { userId: clientId },
      select: { stripeCustomerId: true },
    });
    hasBilling = Boolean(billing?.stripeCustomerId);
  } catch {
    hasBilling = false;
  }

  let subscriptions;
  let counts: number[];
  try {
    subscriptions = await prisma.subscription.findMany({
      where: {
        clientId,
        deletedAt: null,
        status: { in: ['active', 'past_due', 'completed'] },
      },
      include: {
        plan: true,
        paymentLink: { select: { numberOfPaymentsOverride: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });
    if (subscriptions.length === 0) return null;

    // Three at most, so three counts rather than a groupBy — the same number
    // of round trips, and none of the cast gymnastics groupBy needs here.
    counts = await Promise.all(
      subscriptions.map((s) =>
        prisma.payment.count({
          where: { subscriptionId: s.id, status: 'succeeded', deletedAt: null },
        })
      )
    );
  } catch {
    return null;
  }

  const paidBy = new Map(subscriptions.map((s, i) => [s.id, counts[i] ?? 0]));

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6">
        <p className="readout text-[10px] uppercase tracking-wider text-muted-foreground">
          Your coaching
        </p>

        {subscriptions.map((sub) => {
          const required = requiredPayments({
            billingType: sub.plan.billingType,
            numberOfPayments:
              sub.paymentLink?.numberOfPaymentsOverride ?? sub.plan.numberOfPayments,
          });
          const paid = paidBy.get(sub.id) ?? 0;
          const left = paymentsRemaining(paid, required);
          const pct =
            required && required > 0 ? Math.min(100, Math.round((paid / required) * 100)) : null;

          return (
            <div key={sub.id} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-[15px] font-semibold">{sub.plan.name}</p>
                <p className="readout text-[11px] uppercase text-muted-foreground">
                  {required === null
                    ? `${paid} ${paid === 1 ? 'payment' : 'payments'} in`
                    : `${paid} of ${required} payments`}
                </p>
              </div>

              {/*
                Only drawn for a plan that has an end. An ongoing monthly has
                no denominator, so a bar would have to invent one.
              */}
              {pct !== null && (
                <div className="h-1.5 w-full overflow-hidden bg-secondary">
                  <div
                    className="h-full bg-accent shadow-[0_0_12px_-1px_hsl(var(--accent)/0.7)]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}

              <p className="readout text-[10px] uppercase leading-relaxed text-muted-foreground">
                {left !== null && left > 0 && `${left} to go · `}
                {required !== null && left === 0 && 'Paid in full · '}
                {sub.currentPeriodEnd && sub.status === 'active' && !sub.cancelAtPeriodEnd
                  ? `Next payment ${when(sub.currentPeriodEnd, timeZone)}`
                  : sub.cancelAtPeriodEnd && sub.currentPeriodEnd
                    ? `Runs until ${when(sub.currentPeriodEnd, timeZone)}`
                    : 'No payment scheduled'}
              </p>
            </div>
          );
        })}

        {/*
          Only shown once there is a customer to open. Anybody who paid
          before this shipped gets one on their next payment, and a button
          that always failed would be worse than no button.
        */}
        {hasBilling && <ManageBillingButton />}

        {/*
          Said plainly rather than left implied. Somebody reading their own
          billing wants to know who to talk to about it, and on this app that
          is a person they already message every day.
        */}
        <p className="text-xs leading-relaxed text-muted-foreground">
          Anything about your plan, just message your coach.
        </p>
      </CardContent>
    </Card>
  );
}

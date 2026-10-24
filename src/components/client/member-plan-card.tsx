import { prisma } from '@/lib/prisma';
import { SystemWindow, SystemWindowContent } from '@/components/ui/system-window';
import { ManageBillingButton } from '@/components/client/manage-billing-button';

/*
  A Follow My Split member's subscription, in their own words.

  The coaching plan card talks about agreements, totals and payments
  remaining — none of which a $16.99 month-to-month member has. This says
  what they pay, when it renews (or that it is ending), and gives them the
  button to change their card or cancel, which is the promise they bought on.
*/
export async function MemberPlanCard({
  clientId,
  timeZone,
}: {
  clientId: string;
  timeZone: string;
}) {
  const sub = await prisma.subscription.findFirst({
    where: { clientId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    include: { plan: { select: { name: true, price: true } } },
  });
  if (!sub) return null;

  const price = `$${Number(sub.plan.price).toFixed(2)}/month`;
  const when = sub.currentPeriodEnd
    ? sub.currentPeriodEnd.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        timeZone,
      })
    : null;

  const line =
    sub.status === 'canceled' || sub.status === 'completed'
      ? 'Your subscription has ended.'
      : sub.cancelAtPeriodEnd
        ? when
          ? `Cancelled — you keep access until ${when}.`
          : 'Cancelled — you keep access until the end of this month.'
        : when
          ? `Renews ${when}. Cancel anytime.`
          : 'Renews monthly. Cancel anytime.';

  return (
    <SystemWindow title="Your subscription" meta={`[${price}]`}>
      <SystemWindowContent className="flex flex-col gap-3 pt-4">
        <p className="text-sm font-medium">{sub.plan.name}</p>
        <p className="text-sm text-muted-foreground">{line}</p>
        <ManageBillingButton label={sub.cancelAtPeriodEnd ? 'Manage subscription' : 'Manage or cancel'} />
      </SystemWindowContent>
    </SystemWindow>
  );
}

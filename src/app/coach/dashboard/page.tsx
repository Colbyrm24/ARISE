import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

async function getDashboardCounts(coachId: string) {
  const [unreadMessages, newLeads, unsignedContracts, failedPayments] = await Promise.all([
    prisma.message.count({ where: { recipientId: coachId, readAt: null } }),
    prisma.client.count({ where: { coachId, status: { in: ['lead', 'payment_pending'] } } }),
    prisma.contract.count({ where: { client: { coachId }, signature: null } }),
    prisma.payment.count({ where: { client: { coachId }, status: 'failed' } }),
  ]);

  return { unreadMessages, newLeads, unsignedContracts, failedPayments };
}

const summaryCards = [
  { key: 'unreadMessages', label: 'Unread Messages', href: '/coach/inbox' },
  { key: 'newLeads', label: 'New Leads', href: '/coach/clients' },
  { key: 'unsignedContracts', label: 'Contracts Waiting', href: '/coach/payments' },
  { key: 'failedPayments', label: 'Failed Payments', href: '/coach/payments' },
] as const;

export default async function CoachDashboardPage() {
  const user = await getCurrentUser();
  const counts = user ? await getDashboardCounts(user.id) : null;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Who needs you today?</h1>
      </header>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {summaryCards.map(({ key, label, href }) => (
          <Link key={key} href={href}>
            <Card className="transition-colors hover:bg-secondary/40">
              <CardContent className="pt-6">
                <p className="text-3xl font-semibold">{counts?.[key] ?? 0}</p>
                <p className="mt-1 text-sm text-muted-foreground">{label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Clients</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Your client list, adherence, and payment status will show here as soon as clients start
            coming through onboarding in Phase 3.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { STATUS_LABELS, statusBadgeVariant } from '@/lib/client-status';

// Single-coach MVP: counts and the recent-clients list below cover every
// client rather than filtering by an assigned coachId — there's only one
// coach using ARISE right now, and no assignment flow exists yet to give
// coachId a real value. Revisit once multi-coach support is built.
async function getDashboardCounts(coachId: string) {
  const [unreadMessages, newLeads, unsignedContracts, failedPayments] = await Promise.all([
    prisma.message.count({ where: { recipientId: coachId, readAt: null } }),
    prisma.client.count({ where: { status: { in: ['lead', 'payment_pending'] } } }),
    prisma.contract.count({ where: { signature: null } }),
    prisma.payment.count({ where: { status: 'failed' } }),
  ]);

  return { unreadMessages, newLeads, unsignedContracts, failedPayments };
}

function initials(name: string | null | undefined, email: string) {
  if (name) {
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
    return (first + last).toUpperCase();
  }
  return email[0]?.toUpperCase() ?? '?';
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
  const recentClients = await prisma.client.findMany({
    include: { user: { include: { profile: true } } },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

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
            <Card interactive>
              <CardContent className="pt-6">
                <p className="text-3xl font-semibold">{counts?.[key] ?? 0}</p>
                <p className="mt-1 text-sm text-muted-foreground">{label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Recent Clients</CardTitle>
          <Link href="/coach/clients" className="text-xs font-medium text-accent hover:underline">
            View all
          </Link>
        </CardHeader>
        <CardContent>
          {recentClients.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No clients yet — they&apos;ll show up here as soon as someone signs up.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {recentClients.map((client) => {
                const name = client.user.profile?.fullName ?? null;
                return (
                  <Link
                    key={client.userId}
                    href={`/coach/clients/${client.userId}`}
                    className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-secondary/40"
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="text-xs">
                        {initials(name, client.user.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{name ?? client.user.email}</p>
                      <p className="truncate text-xs text-muted-foreground">{client.user.email}</p>
                    </div>
                    <Badge variant={statusBadgeVariant(client.status)}>
                      {STATUS_LABELS[client.status]}
                    </Badge>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

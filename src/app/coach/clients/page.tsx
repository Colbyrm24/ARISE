import Link from 'next/link';
import { Search } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CLIENT_STATUSES, STATUS_LABELS, statusBadgeVariant } from '@/lib/client-status';
import type { ClientStatus } from '@prisma/client';

function initials(name: string | null | undefined, email: string) {
  if (name) {
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
    return (first + last).toUpperCase();
  }
  return email[0]?.toUpperCase() ?? '?';
}

// Single-coach MVP: every client belongs to the one coach using ARISE, so
// this shows everyone rather than filtering by an assigned coachId. Once
// multi-coach support matters, add that filter back in with a real
// assignment flow behind it.
export default async function CoachClientsPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string };
}) {
  const q = searchParams.q?.trim();
  const statusFilter = (CLIENT_STATUSES as string[]).includes(searchParams.status ?? '')
    ? (searchParams.status as ClientStatus)
    : undefined;

  /*
    Scoped to this coach's roster.

    The second page under /coach with no auth call of its own — the layout's
    requireCoach() answers "is a coach", and this then listed every client in
    the database with their name, email and status. It is also where the
    client ids that made the other gaps in this pass targetable came from,
    and every row links to a record page that now 404s unless it's yours.
  */
  const coach = await requireCoach();

  const clients = await prisma.client.findMany({
    where: {
      coachId: coach.id,
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(q
        ? {
            OR: [
              { user: { email: { contains: q, mode: 'insensitive' } } },
              { user: { profile: { fullName: { contains: q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    },
    include: { user: { include: { profile: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Clients</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {clients.length} {clients.length === 1 ? 'client' : 'clients'}
        </p>
      </header>

      <form className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
        <div className="relative w-full sm:max-w-xs">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search by name or email…"
            className="h-11 w-full rounded-xl border border-border bg-secondary/30 pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <Button type="submit" variant="secondary" size="sm" className="w-fit">
          Search
        </Button>
      </form>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/coach/clients"
          className={cn(
            'rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors',
            !statusFilter
              ? 'bg-accent text-accent-foreground ring-accent'
              : 'bg-secondary/50 text-muted-foreground ring-border hover:text-foreground'
          )}
        >
          All
        </Link>
        {CLIENT_STATUSES.map((status) => (
          <Link
            key={status}
            href={`/coach/clients?status=${status}`}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors',
              statusFilter === status
                ? 'bg-accent text-accent-foreground ring-accent'
                : 'bg-secondary/50 text-muted-foreground ring-border hover:text-foreground'
            )}
          >
            {STATUS_LABELS[status]}
          </Link>
        ))}
      </div>

      {clients.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            {q || statusFilter
              ? 'No clients match that search.'
              : "No clients yet — they'll show up here as soon as someone signs up."}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {clients.map((client) => {
            const name = client.user.profile?.fullName ?? null;
            return (
              <Link key={client.userId} href={`/coach/clients/${client.userId}`}>
                <Card interactive>
                  <CardContent className="flex items-center gap-4 pt-6">
                    <Avatar className="h-11 w-11">
                      <AvatarFallback>{initials(name, client.user.email)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{name ?? client.user.email}</p>
                      <p className="truncate text-xs text-muted-foreground">{client.user.email}</p>
                    </div>
                    <Badge variant={statusBadgeVariant(client.status)}>
                      {STATUS_LABELS[client.status]}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

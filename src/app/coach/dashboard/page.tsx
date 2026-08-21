import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { STATUS_LABELS, statusBadgeVariant } from '@/lib/client-status';
import { NotificationList } from '@/components/notifications/notification-list';
import { getSegments, getRecentActivity, initialsOf, ago } from '@/lib/console';
import { markAllNotificationsRead } from './notification-actions';

// Single-coach MVP: counts and the client lists below cover every client
// rather than filtering by an assigned coachId — there's only one coach
// using ARISE right now, and no assignment flow exists yet to give coachId a
// real value. Revisit once multi-coach support is built.
async function getDashboardCounts(coachId: string) {
  const [unreadMessages, newLeads, unsignedAgreements, failedPayments] = await Promise.all([
    prisma.message.count({ where: { recipientId: coachId, readAt: null } }),
    prisma.client.count({ where: { status: { in: ['lead', 'payment_pending'] } } }),
    prisma.agreement.count({ where: { signature: null } }),
    prisma.payment.count({ where: { status: 'failed' } }),
  ]);

  return { unreadMessages, newLeads, unsignedAgreements, failedPayments };
}

const summaryCards = [
  { key: 'unreadMessages', label: 'Unread Messages', href: '/coach/inbox' },
  { key: 'newLeads', label: 'New Leads', href: '/coach/clients' },
  { key: 'unsignedAgreements', label: 'Agreements Waiting', href: '/coach/payments' },
  { key: 'failedPayments', label: 'Failed Payments', href: '/coach/payments' },
] as const;

/** Square initial tile. Overlapped in stacks, standalone in the feed. */
function Av({ children, stacked }: { children: React.ReactNode; stacked?: boolean }) {
  return (
    <span
      className={
        'flex h-6 w-6 shrink-0 items-center justify-center border border-border bg-secondary ' +
        'font-mono text-[9px] uppercase tracking-wider text-muted-foreground' +
        (stacked ? ' -ml-[7px] first:ml-0' : '')
      }
    >
      {children}
    </span>
  );
}

export default async function CoachDashboardPage() {
  const user = await getCurrentUser();

  const [counts, segments, activity, recentClients, notifications] = await Promise.all([
    user ? getDashboardCounts(user.id) : Promise.resolve(null),
    user ? getSegments(user.id) : Promise.resolve([]),
    getRecentActivity(12),
    prisma.client.findMany({
      include: { user: { include: { profile: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    user
      ? prisma.notification.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: 'desc' },
          take: 12,
        })
      : Promise.resolve([]),
  ]);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="flex flex-col gap-8">
      <header className="border-b border-border pb-5">
        <p className="readout text-[11px] uppercase text-muted-foreground">
          {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </p>
        <h1 className="display mt-2 text-3xl">Who needs you today?</h1>
      </header>

      {/* Counts are something the system reports about itself, so they take
          the mono voice. A zero stays quiet; anything above zero is lit. */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {summaryCards.map(({ key, label, href }) => {
          const n = counts?.[key] ?? 0;
          return (
            <Link key={key} href={href}>
              <Card interactive className="h-full">
                <CardContent className="pt-5">
                  <p
                    className={
                      n > 0
                        ? 'readout text-3xl text-accent glow-soft'
                        : 'readout text-3xl text-muted-foreground'
                    }
                  >
                    {String(n).padStart(2, '0')}
                  </p>
                  <p className="readout mt-2 text-[10px] uppercase text-muted-foreground">{label}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_336px]">
        <div className="flex min-w-0 flex-col gap-6">
          {/*
            Segments, not counts. The whole point is seeing *who* without
            clicking — a number tells you there's a problem, the faces tell
            you whose problem it is.
          */}
          <Card>
            <CardHeader>
              <CardTitle>Client segments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid min-w-0 gap-px bg-border sm:grid-cols-2">
                {segments.map((seg) => (
                  <Link
                    key={seg.key}
                    href={seg.href}
                    className="group flex flex-col gap-2 bg-card p-4 transition-colors hover:bg-secondary/50"
                  >
                    <p className="readout min-h-[28px] text-[10px] uppercase leading-relaxed text-muted-foreground">
                      {seg.label}
                    </p>
                    <p
                      className={
                        seg.people.length === 0
                          ? 'readout text-2xl text-muted-foreground'
                          : seg.warn
                            ? 'readout text-2xl text-destructive'
                            : 'readout text-2xl text-accent glow-soft'
                      }
                    >
                      {String(seg.people.length).padStart(2, '0')}
                    </p>
                    {seg.people.length > 0 && (
                      <span className="flex items-center">
                        {seg.people.slice(0, 4).map((p) => (
                          <Av key={p.id} stacked>
                            {p.initials}
                          </Av>
                        ))}
                        {seg.people.length > 4 && (
                          <Av stacked>+{seg.people.length - 4}</Av>
                        )}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>
                Activity
                {unreadCount > 0 && <span className="ml-2 text-accent">[{unreadCount}]</span>}
              </CardTitle>
              {unreadCount > 0 && (
                <form action={markAllNotificationsRead}>
                  <button
                    type="submit"
                    className="readout text-[10px] uppercase text-accent hover:underline"
                  >
                    Mark all read
                  </button>
                </form>
              )}
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <NotificationList notifications={notifications} role="coach" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Recent clients</CardTitle>
              <Link
                href="/coach/clients"
                className="readout text-[10px] uppercase text-accent hover:underline"
              >
                View all
              </Link>
            </CardHeader>
            <CardContent>
              {recentClients.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No clients yet — they&apos;ll show up here as soon as someone signs up.
                </p>
              ) : (
                <div className="flex flex-col">
                  {recentClients.map((client) => {
                    const name = client.user.profile?.fullName ?? null;
                    return (
                      <Link
                        key={client.userId}
                        href={`/coach/clients/${client.userId}`}
                        className="-mx-2 flex items-center gap-3 border-b border-border/50 px-2 py-3 transition-colors last:border-b-0 hover:bg-secondary/40"
                      >
                        <Av>{initialsOf(name, client.user.email)}</Av>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {name ?? client.user.email}
                          </p>
                          <p className="readout truncate text-[10px] text-muted-foreground">
                            {client.user.email}
                          </p>
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

        {/*
          The rail. Every line carries its own number so the coach can react
          straight from here — "620 cal, 48g protein" is enough to reply to
          without opening anything.
        */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing logged in the last week.
              </p>
            ) : (
              <ul className="flex flex-col">
                {activity.map((a) => (
                  <li key={a.id} className="border-b border-border/50 py-3 last:border-b-0">
                    <Link
                      href={`/coach/clients/${a.clientId}`}
                      className="flex items-start gap-3 transition-opacity hover:opacity-80"
                    >
                      {a.photoUrl ? (
                        /* The plate, right in the rail. Seeing what they ate
                           beside the numbers they entered is the whole point —
                           it's what makes a wrong guess correctable. */
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={a.photoUrl}
                          alt=""
                          className="h-10 w-10 shrink-0 border border-border object-cover"
                        />
                      ) : (
                        <Av>{a.initials}</Av>
                      )}
                      <span className="min-w-0 flex-1 text-[13px] leading-snug">
                        <span className="font-medium">{a.name}</span>{' '}
                        <span className="text-muted-foreground">{a.text}</span>
                      </span>
                      <span className="readout shrink-0 text-[10px] text-muted-foreground">
                        {ago(a.at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

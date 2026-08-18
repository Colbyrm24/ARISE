import Link from 'next/link';
import { requireCoach } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

function initials(name: string | null | undefined, email: string) {
  if (name) {
    const p = name.trim().split(/\s+/);
    return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1]?.[0] ?? '' : '')).toUpperCase();
  }
  return email[0]?.toUpperCase() ?? '?';
}

/**
 * Answers "who is waiting on me?" — unread first, then most recent.
 * Clients who have never messaged still appear so the coach can open a thread.
 */
export default async function CoachInboxPage() {
  const coach = await requireCoach();

  const rels = await prisma.coachClientRelationship.findMany({
    where: { coachId: coach.id, status: 'active' },
    include: { client: { include: { profile: true } } },
  });

  const rows = await Promise.all(
    rels.map(async (rel) => {
      const [last, unread] = await Promise.all([
        prisma.message.findFirst({
          where: {
            OR: [
              { senderId: coach.id, recipientId: rel.clientId },
              { senderId: rel.clientId, recipientId: coach.id },
            ],
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.message.count({
          where: { senderId: rel.clientId, recipientId: coach.id, readAt: null },
        }),
      ]);
      return { rel, last, unread };
    })
  );

  rows.sort((a, b) => {
    if (a.unread !== b.unread) return b.unread - a.unread;
    const at = a.last?.createdAt?.getTime() ?? 0;
    const bt = b.last?.createdAt?.getTime() ?? 0;
    return bt - at;
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {rows.filter((r) => r.unread > 0).length} conversation
        {rows.filter((r) => r.unread > 0).length === 1 ? '' : 's'} need a reply
      </p>

      <Card className="mt-6">
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No active clients yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map(({ rel, last, unread }) => (
                <li key={rel.clientId}>
                  <Link
                    href={`/coach/inbox/${rel.clientId}`}
                    className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-secondary/40"
                  >
                    <Avatar>
                      <AvatarFallback>
                        {initials(rel.client.profile?.fullName, rel.client.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className={cn('truncate text-sm', unread > 0 && 'font-semibold')}>
                        {rel.client.profile?.fullName ?? rel.client.email}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {last?.body ?? 'No messages yet'}
                      </p>
                    </div>
                    {unread > 0 && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                        {unread}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

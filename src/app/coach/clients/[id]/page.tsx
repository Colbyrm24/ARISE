import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Pin } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CLIENT_STATUSES, STATUS_LABELS, statusBadgeVariant } from '@/lib/client-status';
import { updateClientStatus, addCoachNote, toggleCoachNotePin } from './actions';

function initials(name: string | null | undefined, email: string) {
  if (name) {
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
    return (first + last).toUpperCase();
  }
  return email[0]?.toUpperCase() ?? '?';
}

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const client = await prisma.client.findUnique({
    where: { userId: params.id },
    include: {
      user: { include: { profile: true } },
      coachNotes: { orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }] },
    },
  });

  if (!client) notFound();

  const name = client.user.profile?.fullName ?? null;

  return (
    <div className="flex flex-col gap-8">
      <Link
        href="/coach/clients"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={15} />
        Clients
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14">
            <AvatarFallback className="text-base">{initials(name, client.user.email)}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-xl font-semibold">{name ?? client.user.email}</h1>
            <p className="text-sm text-muted-foreground">{client.user.email}</p>
          </div>
        </div>
        <Badge variant={statusBadgeVariant(client.status)}>{STATUS_LABELS[client.status]}</Badge>
      </div>

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: 'Training', phase: 'Phase 4' },
          { label: 'Nutrition', phase: 'Phase 5' },
          { label: 'Payments', phase: 'Phase 3' },
        ].map(({ label, phase }) => (
          <Card key={label}>
            <CardContent className="pt-6">
              <p className="text-sm font-medium">{label}</p>
              <p className="mt-1 text-xs text-muted-foreground">Coming in {phase}.</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

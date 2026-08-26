import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { STATUS_LABELS, statusBadgeVariant } from '@/lib/client-status';
import { ClientTabs } from '@/components/coach/client-tabs';

/*
  A client's workspace.

  Everything about a client used to be one 400-line page: status, notes,
  payment, agreement, program, macros, meal plan, habits, steps, weight and
  the intake form, stacked. Finding the macro fields meant scrolling past
  the payment form every time, and adding anything made it worse.

  So the client became a place rather than a page. Who they are stays
  pinned at the top — name, status, one tap to message them — and the work
  splits into tabs underneath. Each tab is its own route, which means each
  one queries only what it draws instead of every page paying for the
  whole client.
*/

function initials(name: string | null | undefined, email: string) {
  if (name) {
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
    return (first + last).toUpperCase();
  }
  return email[0]?.toUpperCase() ?? '?';
}

export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  /*
    Deliberately thin. The header needs a name, an email and a status —
    pulling the client's whole graph here would make every tab pay for data
    it doesn't render.
  */
  const client = await prisma.client.findUnique({
    where: { userId: params.id },
    select: {
      userId: true,
      status: true,
      user: { select: { email: true, profile: { select: { fullName: true } } } },
    },
  });

  if (!client) notFound();

  const name = client.user.profile?.fullName ?? null;

  return (
    <div className="flex flex-col gap-6">
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
            <AvatarFallback className="text-base">
              {initials(name, client.user.email)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">{name ?? client.user.email}</h1>
            <p className="truncate text-sm text-muted-foreground">{client.user.email}</p>
            {/*
              Messaging a client was four clicks away — out to the inbox,
              find them in the list, open the thread. It is the single most
              common thing a coach does from this screen.
            */}
            <Link
              href={`/coach/inbox/${client.userId}`}
              className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-accent"
            >
              <MessageCircle size={13} />
              Message
            </Link>
          </div>
        </div>
        <Badge variant={statusBadgeVariant(client.status)}>{STATUS_LABELS[client.status]}</Badge>
      </div>

      <ClientTabs clientId={client.userId} />

      {children}
    </div>
  );
}

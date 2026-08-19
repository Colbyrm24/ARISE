import Link from 'next/link';
import { MessageCircle, ClipboardCheck, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import { notificationHref, parseBody } from '@/lib/notifications';

export type NotificationRow = {
  id: string;
  type: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
};

const ICONS: Record<string, typeof MessageCircle> = {
  message: MessageCircle,
  check_in: ClipboardCheck,
  progress_photo: Camera,
};

function ago(d: Date) {
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

/**
 * One chronological feed of everything that happened while you weren't
 * looking. Unread entries are weighted; read ones stay visible for a beat so
 * the list doesn't jump out from under you after a click.
 */
export function NotificationList({
  notifications,
  role,
}: {
  notifications: NotificationRow[];
  role: 'coach' | 'client';
}) {
  if (notifications.length === 0) {
    return <p className="p-6 text-sm text-muted-foreground">Nothing new right now.</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {notifications.map((n) => {
        const { clientId, text } = parseBody(n.body);
        const Icon = ICONS[n.type] ?? MessageCircle;
        const unread = !n.readAt;

        return (
          <li key={n.id}>
            <Link
              href={notificationHref(n.type, role, clientId)}
              className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-secondary/40"
            >
              <Icon
                size={16}
                className={cn('shrink-0', unread ? 'text-accent' : 'text-muted-foreground')}
              />
              <p className={cn('min-w-0 flex-1 truncate text-sm', unread && 'font-medium')}>
                {text}
              </p>
              <span className="shrink-0 text-xs text-muted-foreground">{ago(n.createdAt)}</span>
              {unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

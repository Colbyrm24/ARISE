import Link from 'next/link';
import { requireEntitledClient } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card, CardContent } from '@/components/ui/card';
import { NotificationList } from '@/components/notifications/notification-list';

export default async function ClientNotificationsPage() {
  const user = await requireEntitledClient();

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  /*
    Opening the page is the read receipt — but only for what the page showed.

    The list takes 30 and the update was unbounded, so it cleared every unread
    row this user had. Somebody back from two weeks away with 40 unread items
    (activity fires per workout, per cardio log, per protein goal) saw thirty,
    and the other ten were marked read having never been on screen. There is
    no pagination, so those ten were then unreachable and the badge said zero.

    Bounding by the ids actually rendered is the whole fix; the next visit
    picks up whatever is left. Written directly rather than through the server
    action — revalidatePath() is not allowed during a render pass.
  */
  const unreadShown = notifications.filter((n) => !n.readAt).map((n) => n.id);
  if (unreadShown.length > 0) {
    await prisma.notification.updateMany({
      where: { userId: user.id, id: { in: unreadShown }, readAt: null },
      data: { readAt: new Date() },
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Updates</h1>
      </header>

      <Card>
        <CardContent className="px-0 pb-0 pt-0">
          <NotificationList notifications={notifications} role="client" />
        </CardContent>
      </Card>

      <Link
        href="/today"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        Back to today
      </Link>
    </div>
  );
}

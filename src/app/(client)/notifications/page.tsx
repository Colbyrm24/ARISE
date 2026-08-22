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

  // Opening the page is the read receipt. Written directly rather than through
  // the server action — revalidatePath() is not allowed during a render pass.
  if (notifications.some((n) => !n.readAt)) {
    await prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
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

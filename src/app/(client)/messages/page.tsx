import { requireEntitledClient } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { MessageThread } from '@/components/messages/message-thread';
import { Composer } from '@/components/messages/composer';
import { sendMessageToCoach } from './actions';

export default async function MessagesPage() {
  const user = await requireEntitledClient();

  const rel = await prisma.coachClientRelationship.findFirst({
    where: { clientId: user.id, status: 'active' },
    orderBy: { assignedAt: 'desc' },
    include: { coach: { include: { profile: true } } },
  });

  if (!rel) {
    return (
      <div className="pt-10 text-center">
        <h1 className="text-xl font-semibold">Messages</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You&apos;ll be able to message your coach here once you&apos;re assigned one.
        </p>
      </div>
    );
  }

  const messages = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: user.id, recipientId: rel.coachId },
        { senderId: rel.coachId, recipientId: user.id },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });

  // Opening the thread is the read receipt. Written directly rather than through
  // the server action — revalidatePath() is not allowed during a render pass.
  if (messages.some((m) => m.recipientId === user.id && !m.readAt)) {
    await prisma.message.updateMany({
      where: { senderId: rel.coachId, recipientId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
  }

  const coachName = rel.coach.profile?.fullName ?? 'Your coach';

  return (
    <div className="flex min-h-[70vh] flex-col">
      <header className="pb-4">
        <h1 className="text-xl font-semibold">{coachName}</h1>
        <p className="text-sm text-muted-foreground">Your coach</p>
      </header>

      <MessageThread messages={messages} meId={user.id} />
      <Composer action={sendMessageToCoach} placeholder={`Message ${coachName.split(' ')[0]}…`} />
    </div>
  );
}

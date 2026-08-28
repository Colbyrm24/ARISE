import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireCoach } from '@/lib/auth';
import { zoneOf } from '@/lib/day';
import { prisma } from '@/lib/prisma';
import { MessageThread } from '@/components/messages/message-thread';
import { Composer } from '@/components/messages/composer';
import { signVoiceNoteUrls } from '@/lib/voice-notes';
import { initialsOf } from '@/lib/console';
import { sendMessageToClient, sendVoiceNoteToClient } from './actions';

export default async function CoachThreadPage({ params }: { params: { clientId: string } }) {
  const coach = await requireCoach();

  // Never trust the id in the URL — confirm the relationship first.
  const rel = await prisma.coachClientRelationship.findFirst({
    where: { coachId: coach.id, clientId: params.clientId, status: 'active' },
    include: { client: { include: { profile: true, clientRecord: true } } },
  });
  if (!rel) notFound();

  /*
    Newest 200, then flipped for display.

    Ascending with a take gives the OLDEST 200, which means a thread past two
    hundred messages renders its opening weeks forever and never the present —
    the coach opens a client he just heard from and sees August.
  */
  const recent = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: coach.id, recipientId: rel.clientId },
        { senderId: rel.clientId, recipientId: coach.id },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { attachments: true },
  });
  const messages = recent.reverse();

  // One signing round trip for the whole thread rather than one per bubble.
  const audioUrls = await signVoiceNoteUrls(
    messages.flatMap((m) => m.attachments.filter((a) => a.type === 'voice').map((a) => a.storagePath))
  );

  // Opening the thread is the read receipt. Written directly rather than through
  // the server action — revalidatePath() is not allowed during a render pass.
  if (messages.some((m) => m.recipientId === coach.id && !m.readAt)) {
    await prisma.message.updateMany({
      where: { senderId: rel.clientId, recipientId: coach.id, readAt: null },
      data: { readAt: new Date() },
    });
  }

  const name = rel.client.profile?.fullName ?? rel.client.email;

  /*
    Mobile carries a 64px header above this (md:hidden) plus py-8; from md the
    header goes and the padding grows to py-10. dvh rather than vh so the
    phone's URL bar does not push the composer off the bottom of the screen.
  */
  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col md:h-[calc(100dvh-5rem)]">
      <header className="flex shrink-0 items-center gap-3 border-b border-border/60 pb-4">
        <Link href="/coach/inbox" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{name}</h1>
          <p className="text-sm text-muted-foreground">
            {rel.client.clientRecord?.status ?? 'client'}
          </p>
        </div>
        <Link
          href={`/coach/clients/${rel.clientId}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Full record
        </Link>
      </header>

      <MessageThread
        messages={messages}
        meId={coach.id}
        tz={zoneOf(coach.profile)}
        audioUrls={audioUrls}
        otherInitials={initialsOf(rel.client.profile?.fullName, rel.client.email)}
      />
      <Composer
        className="shrink-0 pt-2"
        action={sendMessageToClient}
        voiceAction={sendVoiceNoteToClient}
        placeholder={`Message ${(name ?? '').split(' ')[0]}…`}
        hidden={{ clientId: rel.clientId }}
      />
    </div>
  );
}

import { requireEntitledClient } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { zoneOf } from '@/lib/day';
import { MessageThread } from '@/components/messages/message-thread';
import { Composer } from '@/components/messages/composer';
import { signVoiceNoteUrls } from '@/lib/voice-notes';
import { avatarSrc } from '@/lib/avatars';
import { initialsOf } from '@/lib/console';
import { sendMessageToCoach, sendVoiceNoteToCoach } from './actions';

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

  /*
    Newest 200, then flipped for display.

    Ascending with a take gives the OLDEST 200 — so the moment a thread passes
    two hundred messages it freezes on its opening weeks and stops showing the
    present entirely, including the message just sent. At the rate a coaching
    thread runs that is a few weeks in.
  */
  const recent = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: user.id, recipientId: rel.coachId },
        { senderId: rel.coachId, recipientId: user.id },
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
  if (messages.some((m) => m.recipientId === user.id && !m.readAt)) {
    await prisma.message.updateMany({
      where: { senderId: rel.coachId, recipientId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
  }

  const coachName = rel.coach.profile?.fullName ?? 'Your coach';
  const coachInitials = initialsOf(rel.coach.profile?.fullName, rel.coach.email);
  const coachAvatar = avatarSrc(rel.coach.profile);

  /*
    The screen is a fixed column: header, thread, composer.

    It used to be `min-h-[70vh]` with the thread growing from the top, so a
    two-message conversation sat under the title with half a screen of nothing
    beneath it. Pinning the whole thing to the viewport and letting only the
    thread scroll is what every messaging app does, and it means the composer
    is always under the thumb instead of wherever the content happened to end.

    The subtraction is exactly the layout's own padding — `pt-6 pb-24`, where
    the pb IS the bottom-nav clearance. Charging for the nav again on top of
    that (the first attempt subtracted 11rem) left a 50-85px band of dead
    background between the composer and the nav.

    dvh, not vh: `100vh` is the LARGE viewport, so on a phone with the URL bar
    showing the column already runs past the bottom of the screen.
  */
  return (
    <div className="flex h-[calc(100dvh-7.5rem)] flex-col lg:h-[calc(100dvh-10rem)]">
      <header className="flex shrink-0 items-center gap-3 border-b border-border/60 pb-4">
        {coachAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coachAvatar}
            alt=""
            className="h-11 w-11 shrink-0 border border-accent/30 object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="readout flex h-11 w-11 shrink-0 items-center justify-center border border-accent/30 bg-accent/10 text-xs uppercase text-accent"
          >
            {coachInitials}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">{coachName}</h1>
          <p className="readout text-[10px] uppercase tracking-wider text-muted-foreground">
            Your coach
          </p>
        </div>
      </header>

      <MessageThread
        messages={messages}
        meId={user.id}
        tz={zoneOf(user.profile)}
        audioUrls={audioUrls}
        otherInitials={coachInitials}
      />
      {/*
        The default Composer is `sticky bottom-20`, which was written for a
        page that scrolls as a whole. In a fixed-height column it has no
        scrollport to stick to and simply paints 80px up from where it sits —
        on top of the last message. In here it is just the last row.
      */}
      <Composer
        className="shrink-0 pt-2"
        action={sendMessageToCoach}
        voiceAction={sendVoiceNoteToCoach}
        placeholder={`Message ${coachName.split(' ')[0]}…`}
      />
    </div>
  );
}

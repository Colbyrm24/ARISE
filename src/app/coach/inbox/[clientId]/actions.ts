'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';
import { notify, displayName } from '@/lib/notifications';
import {
  isAllowedVoiceNote,
  removeVoiceNote,
  uploadVoiceNote,
  voiceNotePath,
} from '@/lib/voice-notes';
import type { VoiceNoteResult } from '@/lib/voice-notes';
import { draftCoachReply, type DraftResult, type DraftTurn } from '@/lib/coach-draft';
import { getDayContext } from '@/lib/day-totals';
import { todayFor } from '@/lib/day';
import { THREAD_TURNS } from '@/lib/coach-draft';

/** Confirms this coach actually coaches this client before anything is written. */
async function assertOwns(coachId: string, clientId: string) {
  const rel = await prisma.coachClientRelationship.findFirst({
    where: { coachId, clientId, status: 'active' },
  });
  return Boolean(rel);
}

export async function sendMessageToClient(formData: FormData) {
  const coach = await requireCoach();
  const clientId = formData.get('clientId') as string | null;
  const body = (formData.get('body') as string | null)?.trim();
  if (!clientId || !body) return;
  if (!(await assertOwns(coach.id, clientId))) return;

  await prisma.message.create({
    data: { senderId: coach.id, recipientId: clientId, body },
  });

  const name = await displayName(coach.id);
  await notify(clientId, 'message', `${name}: ${body.slice(0, 80)}`);

  revalidatePath(`/coach/inbox/${clientId}`);
  revalidatePath('/coach/inbox');
}

/**
 * A voice note from the coach.
 *
 * The same ownership check as a typed message, and for the same reason: every
 * 'use server' export is a public endpoint, so the client id in the form is
 * only ever a claim until the relationship is confirmed.
 */
export async function sendVoiceNoteToClient(formData: FormData): Promise<VoiceNoteResult> {
  const coach = await requireCoach();
  const clientId = formData.get('clientId') as string | null;

  const audio = formData.get('audio');
  if (!clientId || !(audio instanceof File)) {
    return { error: 'That recording came through empty.' };
  }

  const rejected = isAllowedVoiceNote(audio);
  if (rejected) return { error: rejected };

  // Deliberately the same message as a missing client: a coach who does not
  // coach this person learns nothing about whether they exist.
  if (!(await assertOwns(coach.id, clientId))) return { error: 'That client is not yours.' };

  const path = voiceNotePath(coach.id, audio.type);
  const uploadError = await uploadVoiceNote(path, audio);
  if (uploadError) return { error: 'That did not upload — try again.' };

  try {
    await prisma.message.create({
      data: {
        senderId: coach.id,
        recipientId: clientId,
        attachments: { create: [{ storagePath: path, type: 'voice' }] },
      },
    });
  } catch {
    await removeVoiceNote(path);
    return { error: 'That did not send — try again.' };
  }

  const name = await displayName(coach.id);
  await notify(clientId, 'message', `${name} sent a voice message`);

  revalidatePath(`/coach/inbox/${clientId}`);
  revalidatePath('/coach/inbox');
  return { error: null };
}

/**
 * Marks a client's messages read.
 *
 * The coach id comes from the session, never from the caller. The old
 * signature took both ids as plain arguments with no auth check at all —
 * every 'use server' export is a public endpoint the moment it exists, so
 * anyone who knew the action id could mark arbitrary people's mail read.
 */
export async function markClientMessagesRead(clientId: string) {
  const coach = await requireCoach();
  if (!clientId) return;
  if (!(await assertOwns(coach.id, clientId))) return;

  await prisma.message.updateMany({
    where: { senderId: clientId, recipientId: coach.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath('/coach/inbox');
}

/**
 * Drafts the coach's next message in this thread. Returns the text; it is
 * never written to the database and never sent. The coach reads it in the
 * composer and decides.
 *
 * Same ownership check as sending, and for the same reason: this reads a
 * client's conversation and their food, so knowing the id must not be enough.
 */
export async function draftReplyToClient(formData: FormData): Promise<DraftResult> {
  const coach = await requireCoach();
  const clientId = formData.get('clientId') as string | null;
  if (!clientId) return { text: null, error: 'No client on that request.' };
  if (!(await assertOwns(coach.id, clientId))) return { text: null, error: 'That client is not yours.' };

  const client = await prisma.user.findUnique({
    where: { id: clientId },
    include: { profile: true, clientRecord: true },
  });
  if (!client) return { text: null, error: 'That client is not yours.' };

  const recent = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: coach.id, recipientId: clientId },
        { senderId: clientId, recipientId: coach.id },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: THREAD_TURNS,
    include: { attachments: true },
  });

  /*
    A voice note has no body. Saying so is better than dropping the row: a
    thread where the last thing said was a recording reads as silence
    otherwise, and the draft would answer the message before it.
  */
  const thread: DraftTurn[] = recent
    .reverse()
    .map((m) => ({
      from: m.senderId === coach.id ? ('coach' as const) : ('client' as const),
      body: m.body?.trim() || (m.attachments.length ? '[sent a voice message]' : ''),
    }))
    .filter((t) => t.body.length > 0);

  // Their own day, in their own timezone — 9pm for them is not 9pm for him.
  const day = await getDayContext(clientId, todayFor(client));

  const full = client.profile?.fullName ?? client.email;
  return draftCoachReply({
    clientFirstName: (full ?? '').split(' ')[0] || 'them',
    status: client.clientRecord?.status ?? null,
    thread,
    day,
  });
}

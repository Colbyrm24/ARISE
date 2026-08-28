'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireClient } from '@/lib/auth';
import { notify, displayName } from '@/lib/notifications';
import { primaryCoach } from '@/lib/onboard-client';
import {
  isAllowedVoiceNote,
  removeVoiceNote,
  uploadVoiceNote,
  voiceNotePath,
} from '@/lib/voice-notes';
import type { VoiceNoteResult } from '@/lib/voice-notes';

/**
 * A client only ever talks to their own coach. We resolve the coach from
 * coach_client_relationships rather than letting the browser name a
 * recipient — otherwise a client could message anyone by id.
 */
export async function coachIdForClient(clientId: string) {
  const rel = await prisma.coachClientRelationship.findFirst({
    where: { clientId, status: 'active' },
    orderBy: { assignedAt: 'desc' },
  });
  if (rel?.coachId) return rel.coachId;

  /*
    Somebody who signed up but hasn't been assigned yet still needs to be
    able to ask a question — that is exactly the person most likely to have
    one. Falling back to the instance's primary coach is the same assumption
    the signup path already makes, and it is still not a recipient the
    browser gets to name.

    Ordered rather than "whichever row comes back first": the moment there
    are two coaches, an unordered findFirst would route an unassigned
    client's message to an arbitrary one. Deterministic is not correct for
    multi-coach, but it is at least predictable, and it fails the same way
    every time instead of intermittently.
  */
  return (await primaryCoach())?.id ?? null;
}

export async function sendMessageToCoach(formData: FormData) {
  const user = await requireClient();
  const body = (formData.get('body') as string | null)?.trim();
  if (!body) return;

  const coachId = await coachIdForClient(user.id);
  if (!coachId) return;

  await prisma.message.create({
    data: { senderId: user.id, recipientId: coachId, body },
  });

  const name = await displayName(user.id);
  await notify(coachId, 'message', `${name}: ${body.slice(0, 80)}`, { clientId: user.id });

  revalidatePath('/messages');
  // A waiting client sends from /welcome, which is the only screen they can
  // reach — their own message has to appear there too.
  revalidatePath('/welcome');
}

/**
 * A voice note from the client.
 *
 * Written as message + attachment in one transaction. Uploading first and
 * writing after would leave an orphaned object in the bucket every time the
 * insert failed, and a message row with no attachment is worse than either —
 * it renders as an empty bubble the coach cannot play.
 */
export async function sendVoiceNoteToCoach(formData: FormData): Promise<VoiceNoteResult> {
  const user = await requireClient();

  const audio = formData.get('audio');
  if (!(audio instanceof File)) return { error: 'That recording came through empty.' };

  const rejected = isAllowedVoiceNote(audio);
  if (rejected) return { error: rejected };

  const coachId = await coachIdForClient(user.id);
  if (!coachId) return { error: 'You are not assigned a coach yet.' };

  const path = voiceNotePath(user.id, audio.type);
  const uploadError = await uploadVoiceNote(path, audio);
  if (uploadError) return { error: 'That did not upload — try again.' };

  try {
    await prisma.message.create({
      data: {
        senderId: user.id,
        recipientId: coachId,
        // No body: the recording is the message.
        attachments: { create: [{ storagePath: path, type: 'voice' }] },
      },
    });
  } catch {
    // Nothing points at the object now, so it is litter in a private bucket.
    await removeVoiceNote(path);
    return { error: 'That did not send — try again.' };
  }

  const name = await displayName(user.id);
  await notify(coachId, 'message', `${name} sent a voice message`, { clientId: user.id });

  revalidatePath('/messages');
  revalidatePath('/welcome');
  return { error: null };
}

/** Marks everything the coach sent this client as read. */
export async function markCoachMessagesRead() {
  const user = await requireClient();
  await prisma.message.updateMany({
    where: { recipientId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath('/messages');
}

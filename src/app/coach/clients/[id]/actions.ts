'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';
import type { ClientStatus } from '@prisma/client';

/**
 * Server Actions for the client detail page. Each one re-checks that the
 * caller is actually a coach before touching the database — the page
 * only rendering for coaches is a convenience, not the real boundary.
 */

export async function updateClientStatus(formData: FormData) {
  await requireCoach();

  const clientId = formData.get('clientId') as string | null;
  const status = formData.get('status') as ClientStatus | null;
  if (!clientId || !status) return;

  await prisma.client.update({
    where: { userId: clientId },
    data: { status },
  });

  revalidatePath(`/coach/clients/${clientId}`);
  revalidatePath('/coach/clients');
  revalidatePath('/coach/dashboard');
}

export async function addCoachNote(formData: FormData) {
  const coach = await requireCoach();

  const clientId = formData.get('clientId') as string | null;
  const body = (formData.get('body') as string | null)?.trim();
  if (!clientId || !body) return;

  await prisma.coachNote.create({
    data: {
      clientId,
      coachId: coach.id,
      body,
    },
  });

  revalidatePath(`/coach/clients/${clientId}`);
}

export async function toggleCoachNotePin(formData: FormData) {
  await requireCoach();

  const noteId = formData.get('noteId') as string | null;
  const clientId = formData.get('clientId') as string | null;
  const currentlyPinned = formData.get('pinned') === 'true';
  if (!noteId || !clientId) return;

  await prisma.coachNote.update({
    where: { id: noteId },
    data: { pinned: !currentlyPinned },
  });

  revalidatePath(`/coach/clients/${clientId}`);
}

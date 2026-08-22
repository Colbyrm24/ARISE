'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';
import { coachOwnsClient } from '@/lib/coach-guard';

/**
 * Assigning/unassigning a program on a client's profile. A client only
 * ever has one *active* program at a time — assigning a new one retires
 * whatever was active before rather than deleting it, so past programs
 * stay visible in history.
 */

export async function assignProgram(formData: FormData) {
  const coach = await requireCoach();

  const clientId = formData.get('clientId') as string | null;
  const templateId = formData.get('templateId') as string | null;
  if (!clientId || !templateId) return;
  if (!(await coachOwnsClient(coach.id, clientId))) return;

  await prisma.$transaction([
    prisma.clientProgram.updateMany({
      where: { clientId, active: true },
      data: { active: false },
    }),
    prisma.clientProgram.create({
      data: { clientId, templateId, active: true },
    }),
  ]);

  revalidatePath(`/coach/clients/${clientId}`);
}

export async function unassignProgram(formData: FormData) {
  const coach = await requireCoach();

  const clientProgramId = formData.get('clientProgramId') as string | null;
  const clientId = formData.get('clientId') as string | null;
  if (!clientProgramId || !clientId) return;
  if (!(await coachOwnsClient(coach.id, clientId))) return;

  // Scoped by clientId too, so a program id belonging to another client
  // can't be retired through this client's form.
  await prisma.clientProgram.updateMany({
    where: { id: clientProgramId, clientId },
    data: { active: false },
  });

  revalidatePath(`/coach/clients/${clientId}`);
}

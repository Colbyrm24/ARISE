'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';
import { isApplicationStatus } from '@/lib/application-fields';

/**
 * Moves an application along the pipeline.
 *
 * Applications belong to the practice rather than to a client, so the guard
 * is "is this a coach" — there is no per-client ownership to check.
 */
export async function setApplicationStatus(formData: FormData) {
  await requireCoach();
  const id = String(formData.get('id') ?? '');
  const status = formData.get('status');
  if (!id || !isApplicationStatus(status)) return;

  await prisma.coachingApplication.updateMany({
    where: { id },
    data: { status, statusAt: new Date() },
  });
  // The layout reads the "new" count for the nav badge.
  revalidatePath('/coach', 'layout');
}

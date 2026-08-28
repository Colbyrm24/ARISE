'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireClient } from '@/lib/auth';
import { avatarPath, isAllowedAvatar, uploadAvatar } from '@/lib/avatars';

export type AvatarState = { ok: boolean; error?: string };

/**
 * Sets the signed-in person's profile picture.
 *
 * Writes to their OWN profile, from the session, with no id on the form —
 * there is no version of this action that takes a user id, so there is no way
 * to point it at somebody else.
 */
export async function updateAvatar(_prev: AvatarState, formData: FormData): Promise<AvatarState> {
  const user = await requireClient();

  const file = formData.get('avatar') as File | null;
  const problem = isAllowedAvatar(file);
  if (problem || !file) return { ok: false, error: problem ?? 'Pick a photo first.' };

  const result = await uploadAvatar(avatarPath(user.id, file.name), file);
  if ('error' in result) {
    console.error('avatar upload failed:', result.error);
    return { ok: false, error: "Couldn't upload that one. Try again." };
  }

  /*
    Upsert, not update.

    A Profile row is created at signup for everybody who goes through the
    normal flow, but accounts predate that flow and an update against a missing
    row throws. A person setting their photo is the wrong moment to discover
    their profile row was never written.
  */
  await prisma.profile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, avatarUrl: result.url },
    update: { avatarUrl: result.url },
  });

  // Every screen that renders a face, on both sides of the app.
  revalidatePath('/profile');
  revalidatePath('/today');
  revalidatePath('/messages');
  revalidatePath('/coach/inbox');
  revalidatePath('/coach/clients');

  return { ok: true };
}

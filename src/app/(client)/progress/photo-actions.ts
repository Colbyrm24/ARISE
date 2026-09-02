'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireClient } from '@/lib/auth';
import { todayFor } from '@/lib/day';
import {
  PHOTO_ANGLES,
  type PhotoAngle,
  isAllowedPhoto,
  photoPath,
  uploadPhoto,
  removePhoto,
} from '@/lib/progress-photos';
import { notifyCoach, displayName } from '@/lib/notifications';


export async function uploadProgressPhoto(formData: FormData) {
  const user = await requireClient();

  const angle = formData.get('angle') as string | null;
  if (!angle || !PHOTO_ANGLES.includes(angle as PhotoAngle)) return;

  const file = formData.get('photo') as File | null;
  if (!file || isAllowedPhoto(file) !== null) return;

  const date = todayFor(user);
  const path = photoPath(user.id, date, angle as PhotoAngle, file.name);

  const error = await uploadPhoto(path, file);
  if (error) return;

  /*
    Compensate the upload if the row can't be written.

    The object goes into the bucket first, and this insert ran unguarded — so
    a failure here left a file in private storage with nothing pointing at
    it, which no screen can show and no delete can reach, and threw out of
    the action so the client got Next's unhandled-error page rather than a
    photo. sendVoiceNoteToCoach wraps the identical pair in exactly this and
    calls removeVoiceNote on failure; the photo path was the one that skipped
    it, on the more sensitive bucket of the two.
  */
  try {
    await prisma.progressPhoto.create({
      data: { clientId: user.id, date, angle, storagePath: path },
    });
  } catch (err) {
    await removePhoto(path);
    console.error('Could not record a progress photo', {
      clientId: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  // Uploading front, side and back back-to-back is one event to the coach,
  // not three — so only the first photo of the day pings them.
  const todaysCount = await prisma.progressPhoto.count({
    where: { clientId: user.id, date },
  });
  if (todaysCount === 1) {
    const name = await displayName(user.id);
    await notifyCoach(user.id, 'progress_photo', `${name} uploaded new progress photos`);
  }

  revalidatePath('/progress');
}

export async function deleteProgressPhoto(formData: FormData) {
  const user = await requireClient();
  const id = formData.get('photoId') as string | null;
  if (!id) return;

  const photo = await prisma.progressPhoto.findUnique({ where: { id } });
  if (!photo || photo.clientId !== user.id) return;

  // Storage first — a dangling row is recoverable, an orphaned file is not.
  await removePhoto(photo.storagePath);
  await prisma.progressPhoto.delete({ where: { id } });

  revalidatePath('/progress');
}

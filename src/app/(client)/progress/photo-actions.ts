'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireClient } from '@/lib/auth';
import {
  PHOTO_ANGLES,
  type PhotoAngle,
  isAllowedPhoto,
  photoPath,
  uploadPhoto,
  removePhoto,
} from '@/lib/progress-photos';

function todayDateOnly() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function uploadProgressPhoto(formData: FormData) {
  const user = await requireClient();

  const angle = formData.get('angle') as string | null;
  if (!angle || !PHOTO_ANGLES.includes(angle as PhotoAngle)) return;

  const file = formData.get('photo') as File | null;
  if (!file || isAllowedPhoto(file) !== null) return;

  const date = todayDateOnly();
  const path = photoPath(user.id, new Date(), angle as PhotoAngle, file.name);

  const error = await uploadPhoto(path, file);
  if (error) return;

  await prisma.progressPhoto.create({
    data: { clientId: user.id, date, angle, storagePath: path },
  });

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

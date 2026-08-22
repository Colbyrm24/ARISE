'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';
import { parseTimeToMinute } from '@/lib/schedule';
import { notify } from '@/lib/notifications';
import { formatSlotFull } from '@/lib/schedule';
import { timeZoneOf } from '@/lib/booking';

function refresh() {
  revalidatePath('/coach/schedule');
  revalidatePath('/coach/dashboard');
  revalidatePath('/book');
  revalidatePath('/today');
}

export async function addAvailability(formData: FormData) {
  const coach = await requireCoach();

  const weekday = Number(formData.get('weekday'));
  const start = parseTimeToMinute((formData.get('start') as string | null) ?? '');
  const end = parseTimeToMinute((formData.get('end') as string | null) ?? '');
  const slot = Number(formData.get('slotMinutes') ?? 30);

  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return;
  if (start === null || end === null || end <= start) return;
  if (!Number.isFinite(slot) || slot < 10 || slot > 240) return;
  // A window shorter than one slot produces nothing bookable, so it's a
  // mistake rather than an empty day.
  if (end - start < slot) return;

  await prisma.coachAvailability.create({
    data: {
      coachId: coach.id,
      weekday,
      startMinute: start,
      endMinute: end,
      slotMinutes: Math.round(slot),
      active: true,
    },
  });
  refresh();
}

export async function removeAvailability(formData: FormData) {
  const coach = await requireCoach();
  const id = formData.get('id') as string | null;
  if (!id) return;

  const row = await prisma.coachAvailability.findUnique({ where: { id } });
  // Scoped to the caller so one coach can't clear another's diary.
  if (!row || row.coachId !== coach.id) return;

  await prisma.coachAvailability.delete({ where: { id } });
  refresh();
}

/**
 * Cancels a call from the coach's side.
 *
 * The row stays and its status changes, which is why the uniqueness index in
 * the database is partial — a cancelled call must not keep its slot reserved.
 */
export async function cancelBookingAsCoach(formData: FormData) {
  const coach = await requireCoach();
  const id = formData.get('id') as string | null;
  if (!id) return;

  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking || booking.coachId !== coach.id || booking.status !== 'booked') return;

  await prisma.booking.update({
    where: { id },
    data: { status: 'cancelled', cancelledAt: new Date(), cancelledBy: 'coach' },
  });

  const profile = await prisma.profile.findUnique({ where: { userId: booking.clientId } });
  await notify(
    booking.clientId,
    'booking',
    `Your call on ${formatSlotFull(booking.startsAt, timeZoneOf(profile))} was cancelled.`
  );
  refresh();
}

/** The link or number people join a booked call on. */
export async function setBookingLocation(formData: FormData) {
  const coach = await requireCoach();
  const location = ((formData.get('location') as string | null) ?? '').trim().slice(0, 300);

  await prisma.profile.upsert({
    where: { userId: coach.id },
    create: { userId: coach.id, bookingLocation: location || null },
    update: { bookingLocation: location || null },
  });
  refresh();
  revalidatePath('/coach/settings');
}

/**
 * The coach's own timezone, which every availability window is expressed in.
 *
 * Getting this wrong shifts every slot the client sees, so it is set here
 * explicitly rather than guessed from the browser.
 */
export async function setTimezone(formData: FormData) {
  const coach = await requireCoach();
  const tz = ((formData.get('timezone') as string | null) ?? '').trim().slice(0, 64);
  if (!tz) return;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    return;
  }

  await prisma.profile.upsert({
    where: { userId: coach.id },
    create: { userId: coach.id, timezone: tz },
    update: { timezone: tz },
  });
  refresh();
  revalidatePath('/coach/settings');
}

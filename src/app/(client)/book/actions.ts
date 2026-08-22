'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireClient } from '@/lib/auth';
import { coachForClient, openSlotsFor, timeZoneOf } from '@/lib/booking';
import { formatSlotFull } from '@/lib/schedule';
import { notify } from '@/lib/notifications';

export type BookResult = { ok: true } | { ok: false; error: string };

function refresh() {
  revalidatePath('/book');
  revalidatePath('/today');
  revalidatePath('/coach/schedule');
}

/**
 * Books a slot.
 *
 * Two clients tapping Book on the same time in the same second is a real
 * race, and the check below does not prevent it — both requests read an empty
 * slot and both try to insert. The partial unique index on (coach_id,
 * starts_at) where status = 'booked' is what actually prevents it; catching
 * P2002 here is only how that becomes a sentence rather than a stack trace.
 */
export async function bookSlot(formData: FormData): Promise<BookResult> {
  const user = await requireClient();

  const startsAtRaw = (formData.get('startsAt') as string | null) ?? '';
  const startsAt = new Date(startsAtRaw);
  if (Number.isNaN(startsAt.getTime())) return { ok: false, error: 'That time is no longer valid.' };

  const note = ((formData.get('note') as string | null) ?? '').trim().slice(0, 300) || null;

  const coach = await coachForClient(user.id);
  if (!coach) return { ok: false, error: 'No coach is set up to take bookings yet.' };

  const tz = timeZoneOf(coach.profile);

  // Re-derive the open slots server-side rather than trusting the time that
  // came back from the form. Without this, a stale page — or anyone editing
  // the request — could book a time the coach never offered.
  const days = await openSlotsFor(coach.id, tz);
  const match = days
    .flatMap((d) => d.slots)
    .find((s) => s.startsAt.getTime() === startsAt.getTime());
  if (!match) return { ok: false, error: 'That slot just went. Pick another one.' };

  // One upcoming call at a time. A client with six booked is a diary problem
  // the coach only finds out about on the day.
  const existing = await prisma.booking.findFirst({
    where: { clientId: user.id, status: 'booked', startsAt: { gte: new Date() } },
  });
  if (existing) {
    return { ok: false, error: 'You already have a call booked. Cancel that one first.' };
  }

  try {
    await prisma.booking.create({
      data: {
        coachId: coach.id,
        clientId: user.id,
        startsAt: match.startsAt,
        endsAt: match.endsAt,
        status: 'booked',
        note,
        // Copied rather than read through the coach's profile at display time,
        // so changing the standing link later cannot rewrite where a call that
        // already happened was held.
        location: coach.profile?.bookingLocation ?? null,
      },
    });
  } catch {
    return { ok: false, error: 'Somebody just took that slot. Pick another one.' };
  }

  const name = user.profile?.fullName || user.email;
  await notify(coach.id, 'booking', `${name} booked ${formatSlotFull(match.startsAt, tz)}.`, {
    clientId: user.id,
  });

  refresh();
  return { ok: true };
}

export async function cancelBooking(formData: FormData) {
  const user = await requireClient();
  const id = formData.get('id') as string | null;
  if (!id) return;

  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking || booking.clientId !== user.id || booking.status !== 'booked') return;

  await prisma.booking.update({
    where: { id },
    data: { status: 'cancelled', cancelledAt: new Date(), cancelledBy: 'client' },
  });

  const coachProfile = await prisma.profile.findUnique({ where: { userId: booking.coachId } });
  const name = user.profile?.fullName || user.email;
  await notify(
    booking.coachId,
    'booking',
    `${name} cancelled ${formatSlotFull(booking.startsAt, timeZoneOf(coachProfile))}.`,
    { clientId: user.id }
  );
  refresh();
}

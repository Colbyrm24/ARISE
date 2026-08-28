import { prisma } from '@/lib/prisma';
import { bookableSlots, groupByDay, type Availability, type Slot } from '@/lib/schedule';

/*
  Reading the schedule.

  The coach ran three calls off text threads today — "you about ready for the
  call??", "mind if I shoot a call over now?", "I'm free until noon" — which
  is a negotiation repeated per client per week. This replaces that with a
  list of times.
*/

/*
  Timezone handling lives in @/lib/day. Re-exported under the names this
  module already used so its callers don't all have to change — but there is
  one implementation, not two identical ones drifting apart.
*/
export { DEFAULT_TZ, zoneOf as timeZoneOf } from '@/lib/day';
export const BOOK_AHEAD_DAYS = 14;

/**
 * The coach a client books with.
 *
 * Falls back to the single coach account when no relationship row exists,
 * because most clients here have never had one written and a booking screen
 * that says "you have no coach" would be both true and useless.
 */
export async function coachForClient(clientId: string) {
  const rel = await prisma.coachClientRelationship.findFirst({
    where: { clientId, status: 'active' },
    orderBy: { assignedAt: 'desc' },
    select: { coachId: true },
  });
  if (rel) {
    const coach = await prisma.user.findUnique({
      where: { id: rel.coachId },
      include: { profile: true },
    });
    if (coach) return coach;
  }

  return prisma.user.findFirst({
    where: { role: { in: ['coach', 'admin'] } },
    orderBy: { createdAt: 'asc' },
    include: { profile: true },
  });
}

export type OpenDay = { label: string; slots: Slot[] };

/** Everything a client can still book, grouped into days they can read. */
export async function openSlotsFor(coachId: string, timeZone: string, now = new Date()) {
  const [availability, booked] = await Promise.all([
    prisma.coachAvailability.findMany({ where: { coachId, active: true } }),
    prisma.booking.findMany({
      where: { coachId, status: 'booked', startsAt: { gte: now } },
      select: { startsAt: true },
    }),
  ]);

  const slots = bookableSlots({
    availability: availability.map(
      (a): Availability => ({
        weekday: a.weekday,
        startMinute: a.startMinute,
        endMinute: a.endMinute,
        slotMinutes: a.slotMinutes,
      })
    ),
    timeZone,
    from: now,
    days: BOOK_AHEAD_DAYS,
    bookedStarts: new Set(booked.map((b) => b.startsAt.getTime())),
  });

  return groupByDay(slots, timeZone);
}

/** A client's calls that haven't happened yet. */
export async function upcomingForClient(clientId: string, now = new Date()) {
  return prisma.booking.findMany({
    where: { clientId, status: 'booked', startsAt: { gte: now } },
    orderBy: { startsAt: 'asc' },
    take: 10,
  });
}

/** The coach's diary, with names attached. */
export async function upcomingForCoach(coachId: string, now = new Date()) {
  const rows = await prisma.booking.findMany({
    where: { coachId, status: 'booked', startsAt: { gte: now } },
    orderBy: { startsAt: 'asc' },
    take: 40,
    include: { client: { include: { profile: true } } },
  });

  return rows.map((b) => ({
    id: b.id,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    note: b.note,
    location: b.location,
    clientName: b.client.profile?.fullName || b.client.email,
  }));
}


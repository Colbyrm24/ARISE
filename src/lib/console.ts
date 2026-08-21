import { prisma } from '@/lib/prisma';
import { signMealPhotoUrls } from '@/lib/meal-photos';

/*
  The coach console's two reads.

  Both answer "who needs me right now" rather than "how many of X exist".
  A count alone makes you click to find out who — so every segment carries
  the actual people, and every activity line carries its number, which is
  what makes the rail coachable without opening a client.
*/

export type Person = {
  id: string;
  name: string;
  initials: string;
};

export type Segment = {
  key: string;
  label: string;
  href: string;
  /** Warn segments are things going wrong, not things going well. */
  warn: boolean;
  people: Person[];
};

const DAY = 86400000;

export function initialsOf(name: string | null | undefined, email: string) {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
    return (first + last).toUpperCase();
  }
  return (email[0] ?? '?').toUpperCase();
}

/** Monday 00:00 UTC of the current week — matches weekOf() in check-in.ts. */
function startOfWeek() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay(); // 0 = Sunday
  d.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
  return d;
}

/**
 * Single-coach MVP: every non-finished client belongs to the one coach, the
 * same assumption getDashboardCounts already makes. Revisit alongside
 * multi-coach assignment.
 */
export async function getSegments(coachId: string): Promise<Segment[]> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const threeDaysAgo = new Date(now.getTime() - 3 * DAY);
  const weekStart = startOfWeek();
  const inSevenDays = new Date(now.getTime() + 7 * DAY);

  const [clients, prSets, weighedIn, messages] = await Promise.all([
    prisma.client.findMany({
      where: { status: { notIn: ['cancelled', 'completed'] } },
      include: { user: { include: { profile: true } } },
    }),

    // Personal bests are flagged at log time by detectPr() in the workout
    // action — reading the flag here keeps this query cheap.
    prisma.workoutLogSet.findMany({
      where: { isPr: true, workoutLog: { startedAt: { gte: weekAgo } } },
      select: { workoutLog: { select: { clientId: true } } },
    }),

    prisma.weightLog.findMany({
      where: { date: { gte: weekStart } },
      select: { clientId: true },
      distinct: ['clientId'],
    }),

    // Most recent message per thread, in either direction. Capped rather than
    // grouped in SQL: at this client count it's one cheap read, and it keeps
    // the "never messaged at all" case working without a second query.
    prisma.message.findMany({
      where: { OR: [{ senderId: coachId }, { recipientId: coachId }] },
      orderBy: { createdAt: 'desc' },
      select: { senderId: true, recipientId: true, createdAt: true },
      take: 2000,
    }),
  ]);

  const person = (c: (typeof clients)[number]): Person => ({
    id: c.userId,
    name: c.user.profile?.fullName ?? c.user.email,
    initials: initialsOf(c.user.profile?.fullName, c.user.email),
  });

  const prIds = new Set(prSets.map((s) => s.workoutLog.clientId));
  const weighedIds = new Set(weighedIn.map((w) => w.clientId));

  const lastMessageAt = new Map<string, Date>();
  for (const m of messages) {
    const other = m.senderId === coachId ? m.recipientId : m.senderId;
    if (!lastMessageAt.has(other)) lastMessageAt.set(other, m.createdAt);
  }

  // Only clients actually in the middle of coaching can be "quiet" or
  // "missing a weigh-in" — a lead who hasn't paid yet is neither.
  const engaged = clients.filter((c) => c.status === 'active' || c.status === 'ending_soon');

  return [
    {
      key: 'ending',
      label: 'Coaching ends this week',
      href: '/coach/clients',
      warn: false,
      people: clients
        .filter((c) => c.endDate && c.endDate >= now && c.endDate <= inSevenDays)
        .map(person),
    },
    {
      key: 'pbs',
      label: 'New personal bests',
      href: '/coach/clients',
      warn: false,
      people: clients.filter((c) => prIds.has(c.userId)).map(person),
    },
    {
      key: 'quiet',
      label: 'Not messaged in 3+ days',
      href: '/coach/inbox',
      warn: true,
      people: engaged
        .filter((c) => {
          const last = lastMessageAt.get(c.userId);
          return !last || last < threeDaysAgo;
        })
        .map(person),
    },
    {
      key: 'noweighin',
      label: 'No weigh-in this week',
      href: '/coach/clients',
      warn: true,
      people: engaged.filter((c) => !weighedIds.has(c.userId)).map(person),
    },
  ];
}

export type ActivityItem = {
  id: string;
  at: Date;
  clientId: string;
  name: string;
  initials: string;
  /** Already carries its number — "logged lunch — 620 cal, 48g protein". */
  text: string;
  /** Signed, short-lived. Present only for meals logged with a photo. */
  photoUrl?: string;
};

/**
 * One feed out of five separate tables. Each line states what happened and
 * what the number was, so the coach can react from the rail instead of
 * opening the client to find out whether 620 calories was good.
 */
export async function getRecentActivity(limit = 12): Promise<ActivityItem[]> {
  const since = new Date(Date.now() - 7 * DAY);

  const [meals, workouts, weights, checkIns, photos] = await Promise.all([
    prisma.nutritionLog.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true, createdAt: true, clientId: true, meal: true,
        calories: true, protein: true, photoPath: true,
      },
    }),
    prisma.workoutLog.findMany({
      where: { completedAt: { gte: since } },
      orderBy: { completedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        completedAt: true,
        clientId: true,
        totalVolume: true,
        workout: { select: { name: true } },
        sets: { select: { isPr: true } },
      },
    }),
    prisma.weightLog.findMany({
      where: { date: { gte: since } },
      orderBy: { date: 'desc' },
      take: limit,
      select: { id: true, date: true, clientId: true, weight: true },
    }),
    prisma.checkIn.findMany({
      where: { submittedAt: { gte: since } },
      orderBy: { submittedAt: 'desc' },
      take: limit,
      select: { id: true, submittedAt: true, clientId: true },
    }),
    prisma.progressPhoto.findMany({
      where: { date: { gte: since } },
      orderBy: { date: 'desc' },
      take: limit,
      select: { id: true, date: true, clientId: true, angle: true },
    }),
  ]);

  const rows: Array<{
    id: string; at: Date; clientId: string; text: string; photoPath?: string | null;
  }> = [
    ...meals.map((m) => ({
      id: `meal-${m.id}`,
      at: m.createdAt,
      clientId: m.clientId,
      text: `logged ${m.meal ?? 'a meal'} — ${m.calories} cal, ${Math.round(Number(m.protein))}g protein`,
      photoPath: m.photoPath,
    })),
    ...workouts.map((w) => {
      const prs = w.sets.filter((s) => s.isPr).length;
      const volume = w.totalVolume ? `${Math.round(Number(w.totalVolume)).toLocaleString()} lb volume` : 'no weights logged';
      return {
        id: `workout-${w.id}`,
        at: w.completedAt as Date,
        clientId: w.clientId,
        text: `finished ${w.workout.name} — ${volume}${prs > 0 ? `, ${prs} PB${prs > 1 ? 's' : ''}` : ''}`,
      };
    }),
    ...weights.map((w) => ({
      id: `weight-${w.id}`,
      at: w.date,
      clientId: w.clientId,
      text: `weighed in at ${Number(w.weight).toFixed(1)} lb`,
    })),
    ...checkIns.map((c) => ({
      id: `checkin-${c.id}`,
      at: c.submittedAt,
      clientId: c.clientId,
      text: 'submitted a weekly check-in',
    })),
    ...photos.map((p) => ({
      id: `photo-${p.id}`,
      at: p.date,
      clientId: p.clientId,
      text: `sent a ${p.angle} progress photo`,
    })),
  ]
    .filter((r) => r.at)
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, limit);

  if (rows.length === 0) return [];

  // One lookup for every name in the merged set rather than per-table joins,
  // and one signing round trip for whatever photos survived the slice.
  const [users, photoUrls] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.clientId))] } },
      include: { profile: true },
    }),
    signMealPhotoUrls(
      rows.map((r) => r.photoPath).filter((p): p is string => Boolean(p))
    ),
  ]);
  const byId = new Map(users.map((u) => [u.id, u]));

  return rows.map(({ photoPath, ...r }) => {
    const u = byId.get(r.clientId);
    return {
      ...r,
      name: u?.profile?.fullName ?? u?.email ?? 'Client',
      initials: initialsOf(u?.profile?.fullName, u?.email ?? '?'),
      photoUrl: photoPath ? photoUrls.get(photoPath) : undefined,
    };
  });
}

/** "6m", "3h", "2d" — the rail has no room for full timestamps. */
export function ago(date: Date): string {
  const mins = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

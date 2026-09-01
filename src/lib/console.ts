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

/*
  Monday 00:00 UTC of the current week.

  Deliberately the server's week, not any one client's: this bounds a
  roster-wide weigh-in query, and there is no single timezone to resolve it
  in. The cost is that a late-Sunday weigh-in on the west coast can read as
  "no weigh-in this week" until Monday — worth knowing, but a segment being
  a few hours eager is a smaller problem than a per-client query per row.

  This used to claim it matched weekOf() in check-in.ts. That stopped being
  true when check-ins moved to the client's own timezone; nothing here
  depends on the two agreeing.
*/
function startOfWeek() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay(); // 0 = Sunday
  d.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
  return d;
}

/**
 * Everything on the console rail, scoped to this coach's roster.
 *
 * The docstring here used to say "single-coach MVP: every non-finished client
 * belongs to the one coach" — which was a description of the data, not of the
 * code, and it stayed put after the queries underneath were scoped. Both are
 * scoped now; nothing on this screen reads outside the roster.
 */
export async function getSegments(coachId: string): Promise<Segment[]> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const threeDaysAgo = new Date(now.getTime() - 3 * DAY);
  const weekStart = startOfWeek();
  const inSevenDays = new Date(now.getTime() + 7 * DAY);

  const [clients, prSets, weighedIn, declining, messages] = await Promise.all([
    prisma.client.findMany({
      // Scoped to this coach. It took a coachId and then listed every client
      // in the database — harmless with one coach, wrong the moment there
      // are two, and the kind of wrong nobody notices until it matters.
      where: { coachId, status: { notIn: ['cancelled', 'completed'] } },
      include: { user: { include: { profile: true } } },
    }),

    // Personal bests are flagged at log time by detectPr() in the workout
    // action — reading the flag here keeps this query cheap.
    prisma.workoutLogSet.findMany({
      where: { isPr: true, workoutLog: { startedAt: { gte: weekAgo }, client: { coachId } } },
      select: { workoutLog: { select: { clientId: true } } },
    }),

    prisma.weightLog.findMany({
      where: { date: { gte: weekStart }, client: { coachId } },
      select: { clientId: true },
      distinct: ['clientId'],
    }),

    /*
      Whose card is being declined.

      The dashboard has counted failed payments since the tile existed and
      linked it at /coach/payments, which lists plans, prices and agreement
      templates and not one payment. So the coach read "03", clicked to find
      out whose cards were failing, and landed on a settings screen. The file
      header on the dashboard describes fixing exactly this for two other
      tiles; this one was left.

      No date bound: a decline from three weeks ago is still a decline, and
      it is still counted by the tile.
    */
    prisma.payment.findMany({
      where: { status: 'failed', client: { coachId } },
      select: { clientId: true },
      distinct: ['clientId'],
    }),

    /*
      Most recent message per thread, in either direction — grouped rather
      than scanned.

      This used to read the newest 2,000 messages globally and reduce them in
      memory. At forty clients exchanging twenty messages a day that window is
      about two and a half days deep, so a client's genuine last message falls
      out of it almost immediately and they appear under "Not messaged in 3+
      days" having been answered this morning. A segment that cries wolf gets
      ignored, and this one exists precisely to be believed.

      Grouping by the pair returns one row per direction per thread and is
      exact at any volume. It's the same shape the inbox uses to work out who
      is owed a reply.
    */
    prisma.message.groupBy({
      by: ['senderId', 'recipientId'],
      where: { OR: [{ senderId: coachId }, { recipientId: coachId }] },
      _max: { createdAt: true },
      // Through `unknown` — see the note in lib/waiting.ts. Casting the
      // groupBy call directly does not compile against real Prisma.
    }) as unknown as Promise<
      Array<{ senderId: string; recipientId: string; _max: { createdAt: Date | null } }>
    >,
  ]);

  const person = (c: (typeof clients)[number]): Person => ({
    id: c.userId,
    name: c.user.profile?.fullName ?? c.user.email,
    initials: initialsOf(c.user.profile?.fullName, c.user.email),
  });

  const prIds = new Set(prSets.map((s) => s.workoutLog.clientId));
  const decliningIds = new Set(declining.map((p) => p.clientId));
  const weighedIds = new Set(weighedIn.map((w) => w.clientId));

  // Newest across the two directions of each thread.
  const lastMessageAt = new Map<string, Date>();
  for (const m of messages) {
    const at = m._max.createdAt;
    if (!at) continue;
    const other = m.senderId === coachId ? m.recipientId : m.senderId;
    const held = lastMessageAt.get(other);
    if (!held || at > held) lastMessageAt.set(other, at);
  }

  // Only clients actually in the middle of coaching can be "quiet" or
  // "missing a weigh-in" — a lead who hasn't paid yet is neither.
  const engaged = clients.filter((c) => c.status === 'active' || c.status === 'ending_soon');

  return [
    {
      key: 'ending',
      label: 'Coaching ends this week',
      href: '/coach/clients?segment=ending',
      warn: false,
      /*
        Status counts, not just endDate.

        `Client.endDate` is declared in the schema and read right here, and
        nothing in the entire codebase ever writes it — so this segment
        rendered 0 permanently. Which is worse than rendering nothing: it says
        "nobody's coaching is ending" when what it means is "we don't track
        that", and the coach only finds out the difference when somebody's
        term runs out unnoticed.

        `ending_soon` is a real status a coach can actually set, so it is what
        makes this segment work today. endDate still counts when it's there,
        for whenever something starts writing it.
      */
      people: clients
        .filter(
          (c) =>
            c.status === 'ending_soon' ||
            (c.endDate && c.endDate >= now && c.endDate <= inSevenDays)
        )
        .map(person),
    },
    {
      key: 'pbs',
      label: 'New personal bests',
      href: '/coach/clients?segment=pbs',
      warn: false,
      people: clients.filter((c) => prIds.has(c.userId)).map(person),
    },
    {
      key: 'quiet',
      label: 'Not messaged in 3+ days',
      href: '/coach/clients?segment=quiet',
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
      href: '/coach/clients?segment=noweighin',
      warn: true,
      people: engaged.filter((c) => !weighedIds.has(c.userId)).map(person),
    },
    {
      key: 'declining',
      label: 'Card declining',
      href: '/coach/clients?segment=declining',
      warn: true,
      // Not limited to `engaged`, unlike the two above it: a decline is the
      // reason somebody is about to stop being active, so filtering by
      // active status would hide the case worth seeing.
      people: clients.filter((c) => decliningIds.has(c.userId)).map(person),
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
export async function getRecentActivity(coachId: string, limit = 12): Promise<ActivityItem[]> {
  const since = new Date(Date.now() - 7 * DAY);

  /*
    Scoped to this coach's clients.

    This function didn't take a coachId at all — it read all five tables
    unfiltered and rendered the result straight onto the dashboard. Every
    line of another coach's activity feed was visible here: their clients'
    names, weigh-ins, meals with the photos signed and attached, check-ins,
    progress photos. Its siblings getSegments and getDashboardCounts have
    both been scoped for a while; this one was missed because it never had
    the parameter to scope by.
  */
  const mine = { client: { coachId } };

  const [meals, workouts, weights, checkIns, photos] = await Promise.all([
    prisma.nutritionLog.findMany({
      where: { createdAt: { gte: since }, ...mine },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true, createdAt: true, clientId: true, meal: true,
        calories: true, protein: true, photoPath: true,
      },
    }),
    prisma.workoutLog.findMany({
      where: { completedAt: { gte: since }, ...mine },
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
      where: { date: { gte: since }, ...mine },
      orderBy: { date: 'desc' },
      take: limit,
      select: { id: true, date: true, clientId: true, weight: true },
    }),
    prisma.checkIn.findMany({
      where: { submittedAt: { gte: since }, ...mine },
      orderBy: { submittedAt: 'desc' },
      take: limit,
      select: { id: true, submittedAt: true, clientId: true },
    }),
    prisma.progressPhoto.findMany({
      where: { date: { gte: since }, ...mine },
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

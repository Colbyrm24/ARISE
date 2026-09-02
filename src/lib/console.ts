import { prisma } from '@/lib/prisma';
import { signMealPhotoUrls } from '@/lib/meal-photos';
import { zoneOf, daysAgoIn, dayOfStored, startOfDay, todayIn } from '@/lib/day';

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

  /*
    The last time the CLIENT said something. Not the last time the thread
    moved.

    This took the newest message in either direction, which was fine right up
    until the daily auto-messenger started writing a real Message from the
    coach's account to every active client each morning. From then on every
    engaged client's thread was under 24h old, permanently, and this segment —
    the one warn segment whose entire job is catching somebody going silent
    before they churn — read 00 every day. It would have read 00 on the exact
    morning a client stopped answering, because the robot answered for him.

    It also measured the wrong thing even before that: a client who has never
    once replied, but gets a nudge daily, counted as engaged.
  */
  const lastSpokeAt = new Map<string, Date>();
  for (const m of messages) {
    const at = m._max.createdAt;
    if (!at) continue;
    // Their side of the thread only.
    if (m.senderId === coachId) continue;
    const held = lastSpokeAt.get(m.senderId);
    if (!held || at > held) lastSpokeAt.set(m.senderId, at);
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
      // "Haven't heard from" rather than "not messaged": the number counts
      // clients who have not spoken, which is the thing worth knowing.
      label: "Haven't heard from in 3+ days",
      href: '/coach/clients?segment=quiet',
      warn: true,
      people: engaged
        .filter((c) => {
          const last = lastSpokeAt.get(c.userId);
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
  /**
   * The right-hand stamp, resolved here rather than in the view.
   *
   * Three of these five tables store a real instant; two store a `@db.Date`
   * day label. Only the view knew how to render a time, and it rendered both
   * kinds identically — see the comment in getRecentActivity.
   */
  when: string;
};

/**
 * One feed out of five separate tables. Each line states what happened and
 * what the number was, so the coach can react from the rail instead of
 * opening the client to find out whether 620 calories was good.
 */
export async function getRecentActivity(coachId: string, limit = 12): Promise<ActivityItem[]> {
  const since = new Date(Date.now() - 7 * DAY);

  /*
    Two of these five tables do not store a time.

    WeightLog.date and ProgressPhoto.date are `@db.Date`. Prisma hands those
    back as UTC midnight of the calendar date — a day LABEL, not the moment
    anything happened. The rail merged all five into one list, sorted them on
    that value and passed every one of them through `ago()`, which measures
    elapsed time from an instant. Applied to a day label it measures elapsed
    time from midnight in London.

    Both halves were wrong, and in the same direction. A client who weighs in
    at 7am and is read by a coach in New York at 10am got "14h" — the weigh-in
    looked like yesterday's. And because the sort used the same number, it
    landed BELOW every meal logged the previous afternoon, so the newest
    weigh-in on the roster sat halfway down a rail that claims to be
    chronological. In summer, at any hour before 8pm Eastern, today's weigh-in
    could not reach the top of the list at all.

    There is no instant to recover — the column does not store one. So a day
    row is sorted at the END of its own day in the coach's zone, clamped to
    now (today's weigh-in therefore sorts as "just now", which is the closest
    true statement available), and labelled by the day rather than by an
    elapsed time it cannot honestly claim to know.
  */
  const coach = await prisma.user.findUnique({
    where: { id: coachId },
    select: { profile: { select: { timezone: true } } },
  });
  const tz = zoneOf(coach?.profile);

  // The two day-label tables get a day-label cutoff. `since` is an instant,
  // and comparing an instant to a `@db.Date` column drops or keeps the
  // seventh day back depending on what time it is when the page loads.
  const sinceDay = daysAgoIn(7, tz);

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
      where: { date: { gte: sinceDay }, ...mine },
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
      where: { date: { gte: sinceDay }, ...mine },
      orderBy: { date: 'desc' },
      take: limit,
      select: { id: true, date: true, clientId: true, angle: true },
    }),
  ]);

  /*
    Where a day-label row belongs on a list of instants.

    The end of that day in the coach's zone, never later than now. Anything
    logged today therefore sorts to the top where it belongs, and a row from
    Tuesday sorts after everything on Monday and before everything on
    Wednesday — which is as precise as a column with no time in it can be.
  */
  const now = new Date();
  const dayInstant = (stored: Date) => {
    const day = dayOfStored(stored);
    const endOfDay = new Date(startOfDay(day, tz).getTime() + DAY - 1);
    return endOfDay > now ? now : endOfDay;
  };

  const rows: Array<{
    id: string; at: Date; clientId: string; text: string;
    photoPath?: string | null; when: string;
  }> = [
    ...meals.map((m) => ({
      id: `meal-${m.id}`,
      at: m.createdAt,
      when: ago(m.createdAt),
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
        when: w.completedAt ? ago(w.completedAt) : '',
        clientId: w.clientId,
        text: `finished ${w.workout.name} — ${volume}${prs > 0 ? `, ${prs} PB${prs > 1 ? 's' : ''}` : ''}`,
      };
    }),
    ...weights.map((w) => ({
      id: `weight-${w.id}`,
      at: dayInstant(w.date),
      when: dayLabel(w.date, tz),
      clientId: w.clientId,
      text: `weighed in at ${Number(w.weight).toFixed(1)} lb`,
    })),
    ...checkIns.map((c) => ({
      id: `checkin-${c.id}`,
      at: c.submittedAt,
      when: ago(c.submittedAt),
      clientId: c.clientId,
      text: 'submitted a weekly check-in',
    })),
    ...photos.map((p) => ({
      id: `photo-${p.id}`,
      at: dayInstant(p.date),
      when: dayLabel(p.date, tz),
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

/**
 * "6m", "3h", "2d" — the rail has no room for full timestamps.
 *
 * Only for real instants. A `@db.Date` value is a day label with no time in
 * it, and passing one here measures the distance from UTC midnight, which is
 * a number about the coach's timezone rather than about the client. Use
 * dayLabel for those.
 */
export function ago(date: Date): string {
  const mins = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

/**
 * "today", "1d", "4d" — the same shape as `ago`, for a stored day label.
 *
 * Counted in calendar days from today in the reader's zone rather than in
 * elapsed hours, because a day label knows the date and nothing finer.
 * "today" rather than "0d": it is the one the coach acts on, and it is the
 * one the old code was most reliably wrong about.
 */
export function dayLabel(stored: Date, tz: string | null | undefined): string {
  const days = Math.round(
    (todayIn(tz).getTime() - dayOfStored(stored).getTime()) / DAY
  );
  if (days <= 0) return 'today';
  return `${days}d`;
}

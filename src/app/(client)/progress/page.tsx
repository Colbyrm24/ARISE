import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { requireEntitledClient } from '@/lib/auth';
import { daysAgoIn, zoneOf, todayFor } from '@/lib/day';
import { weekOverWeek } from '@/lib/weight-trend';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WeightChart } from '@/components/progress/weight-chart';
import { PhotoGrid } from '@/components/progress/photo-grid';
import { PhotoCompare } from '@/components/progress/photo-compare';
import { comparePairs } from '@/lib/photo-compare';
import { AchievementBoard } from '@/components/progress/achievement-board';
import { achievementStatsFor } from '@/lib/achievement-stats';
import { achievementsFor, earnedCount, ACHIEVEMENTS } from '@/lib/achievements';
import { PHOTO_ANGLES, signPhotoUrls } from '@/lib/progress-photos';
import { weekOfFor, formatWeek } from '@/lib/check-in';
import { logWeight, logMeasurement, removeWeightLog } from './actions';
import { uploadProgressPhoto, deleteProgressPhoto } from './photo-actions';

const MEASUREMENTS = [
  { type: 'waist', label: 'Waist' },
  { type: 'chest', label: 'Chest' },
  { type: 'arms', label: 'Arms' },
  { type: 'thighs', label: 'Thighs' },
  { type: 'hips', label: 'Hips' },
] as const;


export default async function ProgressPage() {
  const user = await requireEntitledClient();
  const since = daysAgoIn(90, zoneOf(user.profile));
  // Their week, not the server's — a Sunday-evening check-in on the west
  // coast is already Monday in UTC.
  const thisWeek = weekOfFor(user);

  /*
    The badges. Derived entirely from what is already logged, so somebody who
    has been training for months opens this holding everything they earned
    before the feature existed.
  */
  const badges = achievementsFor(await achievementStatsFor(user.id, todayFor(user)));

  const [logs, measurements, photos, earliestPhotos, thisWeeksCheckIn] = await Promise.all([
    prisma.weightLog.findMany({
      where: { clientId: user.id, date: { gte: since } },
      orderBy: { date: 'asc' },
    }),
    /*
      The only query on this page with no bound of any kind — every
      measurement this client has ever taken, fetched and rendered on every
      visit, growing forever. A year of weekly measurements is already fifty
      rows to draw a trend nobody reads past the first dozen of.
    */
    prisma.measurement.findMany({
      where: { clientId: user.id },
      orderBy: { date: 'desc' },
      take: 52,
    }),
    prisma.progressPhoto.findMany({
      where: { clientId: user.id },
      orderBy: { date: 'desc' },
      take: 24,
    }),
    /*
      The first shoot, fetched separately on purpose.

      The grid above takes the newest 24, so for anyone who has been at this a
      few months the earliest photos — the only ones worth comparing against —
      are simply not in that result. Asking for the oldest few is one more
      cheap indexed read and it is what makes the comparison possible at all.
    */
    prisma.progressPhoto.findMany({
      where: { clientId: user.id },
      orderBy: { date: 'asc' },
      take: 6,
    }),
    prisma.checkIn.findFirst({ where: { clientId: user.id, weekOf: thisWeek } }),
  ]);

  // One signing round trip for both sets — the same photo can appear in each
  // (a client with a single shoot), and signing it twice would be wasteful.
  const signed = await signPhotoUrls(
    [...photos, ...earliestPhotos].map((p) => p.storagePath)
  );
  const tile = (p: (typeof photos)[number]) => ({
    id: p.id,
    date: p.date,
    angle: p.angle,
    url: signed.get(p.storagePath) ?? null,
  });
  const photoTiles = photos.map(tile);
  const comparisons = comparePairs(earliestPhotos.map(tile), photoTiles);

  const points = logs.map((l) => ({ date: l.date, weight: Number(l.weight) }));
  const latest = points[points.length - 1] ?? null;

  // One weigh-in against one weigh-in is mostly water; a week against a week
  // is the real trend. Shared with the coach's card so the client and the
  // coach are never looking at two different numbers for the same person.
  const { change: weekChange } = weekOverWeek(points, zoneOf(user.profile));

  // Newest reading per measurement type.
  const latestByType = new Map<string, (typeof measurements)[number]>();
  for (const m of measurements) if (!latestByType.has(m.type)) latestByType.set(m.type, m);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="display text-2xl">Progress</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Weigh in first thing, same conditions every day.
        </p>
      </header>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex items-baseline gap-3">
            <span className="readout text-3xl text-accent glow-soft">
              {latest ? latest.weight.toFixed(1) : '—'}
            </span>
            <span className="text-sm text-muted-foreground">lb</span>
            {weekChange !== null && (
              <span className="ml-auto text-sm text-muted-foreground">
                {weekChange > 0 ? '+' : ''}
                {weekChange.toFixed(1)} lb vs last week
              </span>
            )}
          </div>

          <form action={logWeight} className="flex gap-2">
            <Input
              name="weight"
              type="number"
              step="0.1"
              min="1"
              inputMode="decimal"
              placeholder="Today's weight"
              required
              className="flex-1"
            />
            <Button type="submit">Log</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Achievements</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="readout text-[11px] uppercase tracking-wider text-muted-foreground">
            {earnedCount(badges)} of {ACHIEVEMENTS.length} earned
          </p>
          <AchievementBoard states={badges} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Last 90 days</CardTitle>
        </CardHeader>
        <CardContent>
          <WeightChart points={points} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Measurements</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="flex flex-col gap-2">
            {MEASUREMENTS.map(({ type, label }) => {
              const m = latestByType.get(type);
              return (
                <li key={type} className="flex items-center justify-between text-sm">
                  <span>{label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {m ? `${Number(m.value).toFixed(1)} in` : '—'}
                  </span>
                </li>
              );
            })}
          </ul>

          <form action={logMeasurement} className="flex gap-2">
            <select
              name="type"
              required
              className="h-11 flex-1 rounded-xl border border-input bg-secondary/40 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {MEASUREMENTS.map(({ type, label }) => (
                <option key={type} value={type}>
                  {label}
                </option>
              ))}
            </select>
            <Input
              name="value"
              type="number"
              step="0.1"
              min="1"
              inputMode="decimal"
              placeholder="Inches"
              required
              className="w-28"
            />
            <Button type="submit">Save</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Photos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <form action={uploadProgressPhoto} className="flex flex-col gap-2">
            <div className="flex gap-2">
              <select
                name="angle"
                required
                className="h-11 w-32 rounded-xl border border-input bg-secondary/40 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {PHOTO_ANGLES.map((a) => (
                  <option key={a} value={a} className="capitalize">
                    {a}
                  </option>
                ))}
              </select>
              <input
                type="file"
                name="photo"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                required
                className="flex-1 text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:text-foreground"
              />
            </div>
            <Button type="submit" size="sm" variant="secondary" className="w-fit">
              Upload
            </Button>
            <p className="text-xs text-muted-foreground">
              Only you and your coach can see these.
            </p>
          </form>

          {/*
            Then and now, before the roll of everything ever taken. This is
            the question the screen exists to answer, so it is not something
            the client has to scroll for or switch on.
          */}
          <PhotoCompare pairs={comparisons} />

          <PhotoGrid photos={photoTiles} action={deleteProgressPhoto} />
        </CardContent>
      </Card>

      <Link href="/check-in">
        <Card className="transition-colors hover:bg-secondary/40">
          <CardContent className="flex items-center justify-between pt-6">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Weekly check-in
              </p>
              <p className="mt-1 text-base font-medium">
                {thisWeeksCheckIn ? 'Submitted' : 'Not sent yet'}
              </p>
              <p className="text-xs text-muted-foreground">{formatWeek(thisWeek)}</p>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      {points.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent weigh-ins</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {logs
                .slice(-10)
                .reverse()
                .map((l) => (
                  <li key={l.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="text-muted-foreground">
                      {l.date.toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        timeZone: 'UTC',
                      })}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="tabular-nums">{Number(l.weight).toFixed(1)} lb</span>
                      <form action={removeWeightLog}>
                        <input type="hidden" name="logId" value={l.id} />
                        <button
                          type="submit"
                          className="text-xs text-muted-foreground hover:text-foreground"
                          aria-label="Delete this weigh-in"
                        >
                          Remove
                        </button>
                      </form>
                    </span>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

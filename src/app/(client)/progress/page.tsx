import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { requireClient } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WeightChart } from '@/components/progress/weight-chart';
import { PhotoGrid } from '@/components/progress/photo-grid';
import { PHOTO_ANGLES, signPhotoUrls } from '@/lib/progress-photos';
import { weekOf, formatWeek } from '@/lib/check-in';
import { logWeight, logMeasurement, removeWeightLog } from './actions';
import { uploadProgressPhoto, deleteProgressPhoto } from './photo-actions';

const MEASUREMENTS = [
  { type: 'waist', label: 'Waist' },
  { type: 'chest', label: 'Chest' },
  { type: 'arms', label: 'Arms' },
  { type: 'thighs', label: 'Thighs' },
  { type: 'hips', label: 'Hips' },
] as const;

function daysAgo(n: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

export default async function ProgressPage() {
  const user = await requireClient();
  const since = daysAgo(90);

  const [logs, measurements, photos, thisWeeksCheckIn] = await Promise.all([
    prisma.weightLog.findMany({
      where: { clientId: user.id, date: { gte: since } },
      orderBy: { date: 'asc' },
    }),
    prisma.measurement.findMany({
      where: { clientId: user.id },
      orderBy: { date: 'desc' },
    }),
    prisma.progressPhoto.findMany({
      where: { clientId: user.id },
      orderBy: { date: 'desc' },
      take: 24,
    }),
    prisma.checkIn.findFirst({ where: { clientId: user.id, weekOf: weekOf() } }),
  ]);

  const signed = await signPhotoUrls(photos.map((p) => p.storagePath));
  const photoTiles = photos.map((p) => ({
    id: p.id,
    date: p.date,
    angle: p.angle,
    url: signed.get(p.storagePath) ?? null,
  }));

  const points = logs.map((l) => ({ date: l.date, weight: Number(l.weight) }));
  const latest = points[points.length - 1] ?? null;

  // Compare the last 7 days against the 7 before it — one weigh-in against
  // one weigh-in is mostly water, a week against a week is the real trend.
  const cut = daysAgo(7).getTime();
  const prevCut = daysAgo(14).getTime();
  const recent = points.filter((p) => p.date.getTime() >= cut);
  const prior = points.filter((p) => p.date.getTime() >= prevCut && p.date.getTime() < cut);
  const mean = (a: typeof points) => a.reduce((s, p) => s + p.weight, 0) / a.length;
  const weekChange =
    recent.length > 0 && prior.length > 0 ? mean(recent) - mean(prior) : null;

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
              <p className="text-xs text-muted-foreground">{formatWeek(weekOf())}</p>
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

import { prisma } from '@/lib/prisma';
import { daysAgoIn, zoneOf } from '@/lib/day';
import { weekOverWeek } from '@/lib/weight-trend';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { WeightChart } from '@/components/progress/weight-chart';
import { PhotoGrid } from '@/components/progress/photo-grid';
import { signPhotoUrls } from '@/lib/progress-photos';
import { CHECK_IN_QUESTIONS, formatWeek, readAnswers } from '@/lib/check-in';


/**
 * Coach-side read-only view of a client's weight trend. Self-fetching so the
 * client detail page only has to drop it in — it's already huge.
 *
 * Access is gated by the coach layout, and the id comes from the coach's own
 * client list, so there's nothing extra to authorize here.
 */
export async function ClientProgressCard({ clientId }: { clientId: string }) {
  // The window and the week boundaries are the client's, not the server's.
  const who = await prisma.user.findUnique({
    where: { id: clientId },
    select: { profile: { select: { timezone: true } } },
  });
  const tz = zoneOf(who?.profile);

  const [logs, measurements, photos, checkIn] = await Promise.all([
    prisma.weightLog.findMany({
      where: { clientId, date: { gte: daysAgoIn(90, tz) } },
      orderBy: { date: 'asc' },
    }),
    prisma.measurement.findMany({
      where: { clientId },
      orderBy: { date: 'desc' },
      take: 20,
    }),
    prisma.progressPhoto.findMany({
      where: { clientId },
      orderBy: { date: 'desc' },
      take: 12,
    }),
    prisma.checkIn.findFirst({ where: { clientId }, orderBy: { weekOf: 'desc' } }),
  ]);

  const signed = await signPhotoUrls(photos.map((p) => p.storagePath));
  const photoTiles = photos.map((p) => ({
    id: p.id,
    date: p.date,
    angle: p.angle,
    url: signed.get(p.storagePath) ?? null,
  }));

  const answers = readAnswers(checkIn?.answersJson);

  const points = logs.map((l) => ({ date: l.date, weight: Number(l.weight) }));
  const latest = points[points.length - 1] ?? null;

  const { change: weekChange } = weekOverWeek(points, tz);

  const latestByType = new Map<string, (typeof measurements)[number]>();
  for (const m of measurements) if (!latestByType.has(m.type)) latestByType.set(m.type, m);

  const daysSinceLast = latest
    ? Math.floor((Date.now() - latest.date.getTime()) / 86400000)
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Progress</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-baseline gap-3">
          <span className="readout text-2xl text-accent glow-soft">
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

        {daysSinceLast !== null && daysSinceLast >= 4 && (
          <p className="rounded-xl border border-border bg-secondary/20 px-4 py-3 text-xs text-muted-foreground">
            Last weigh-in was {daysSinceLast} days ago.
          </p>
        )}

        <WeightChart points={points} />

        {latestByType.size > 0 && (
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            {[...latestByType.entries()].map(([type, m]) => (
              <li key={type}>
                <span className="capitalize">{type}</span>{' '}
                <span className="tabular-nums text-foreground">
                  {Number(m.value).toFixed(1)}&quot;
                </span>
              </li>
            ))}
          </ul>
        )}

        {checkIn && (
          <div className="rounded-xl border border-border bg-secondary/20 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Check-in · {formatWeek(checkIn.weekOf)}
            </p>
            <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
              {CHECK_IN_QUESTIONS.filter((q) => q.type === 'scale').map((q) => (
                <li key={q.key} className="text-muted-foreground">
                  <span className="capitalize">{q.key}</span>{' '}
                  <span className="tabular-nums text-foreground">
                    {typeof answers[q.key] === 'number' ? `${answers[q.key]}/10` : '—'}
                  </span>
                </li>
              ))}
            </ul>
            {CHECK_IN_QUESTIONS.filter((q) => q.type === 'text').map((q) =>
              typeof answers[q.key] === 'string' ? (
                <div key={q.key} className="mt-3">
                  <p className="text-xs text-muted-foreground">{q.label}</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm">{String(answers[q.key])}</p>
                </div>
              ) : null
            )}
          </div>
        )}

        {photoTiles.length > 0 && <PhotoGrid photos={photoTiles} />}
      </CardContent>
    </Card>
  );
}

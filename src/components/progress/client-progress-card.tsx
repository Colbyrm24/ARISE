import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { WeightChart } from '@/components/progress/weight-chart';

function daysAgo(n: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

/**
 * Coach-side read-only view of a client's weight trend. Self-fetching so the
 * client detail page only has to drop it in — it's already huge.
 *
 * Access is gated by the coach layout, and the id comes from the coach's own
 * client list, so there's nothing extra to authorize here.
 */
export async function ClientProgressCard({ clientId }: { clientId: string }) {
  const [logs, measurements] = await Promise.all([
    prisma.weightLog.findMany({
      where: { clientId, date: { gte: daysAgo(90) } },
      orderBy: { date: 'asc' },
    }),
    prisma.measurement.findMany({
      where: { clientId },
      orderBy: { date: 'desc' },
      take: 20,
    }),
  ]);

  const points = logs.map((l) => ({ date: l.date, weight: Number(l.weight) }));
  const latest = points[points.length - 1] ?? null;

  const cut = daysAgo(7).getTime();
  const prevCut = daysAgo(14).getTime();
  const recent = points.filter((p) => p.date.getTime() >= cut);
  const prior = points.filter((p) => p.date.getTime() >= prevCut && p.date.getTime() < cut);
  const mean = (a: typeof points) => a.reduce((s, p) => s + p.weight, 0) / a.length;
  const weekChange = recent.length > 0 && prior.length > 0 ? mean(recent) - mean(prior) : null;

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
          <span className="text-2xl font-semibold tabular-nums">
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
      </CardContent>
    </Card>
  );
}

import { cn } from '@/lib/utils';

export type WeightPoint = { date: Date; weight: number };

/**
 * Single-series weight trend. Server-rendered SVG — no chart library, no
 * client JS, so it paints with the page on a phone.
 *
 * One series means no legend: the heading names it. Only the first and last
 * points get a direct label; a number on every point is noise on a 90-day
 * range. The dotted line is the 7-day rolling average, which is what actually
 * tells you the direction — daily weight bounces with water and food.
 */
export function WeightChart({
  points,
  className,
}: {
  points: WeightPoint[];
  className?: string;
}) {
  if (points.length < 2) {
    return (
      <div className={cn('flex h-40 items-center justify-center', className)}>
        <p className="text-sm text-muted-foreground">
          {points.length === 0
            ? 'No weigh-ins yet.'
            : 'One weigh-in logged — the trend starts at two.'}
        </p>
      </div>
    );
  }

  const sorted = [...points].sort((a, b) => a.date.getTime() - b.date.getTime());

  // 7-day rolling average over the trailing window of actual entries.
  const avg = sorted.map((p, i) => {
    const windowStart = p.date.getTime() - 6 * 86400000;
    const inWindow = sorted.slice(0, i + 1).filter((q) => q.date.getTime() >= windowStart);
    return inWindow.reduce((s, q) => s + q.weight, 0) / inWindow.length;
  });

  const W = 640;
  const H = 200;
  const padX = 8;
  const padTop = 18;
  const padBottom = 24;

  const weights = sorted.map((p) => p.weight);
  const lo = Math.min(...weights, ...avg);
  const hi = Math.max(...weights, ...avg);
  // Never let a flat week render as a flat line pinned to an edge.
  const span = Math.max(hi - lo, 1);
  const yLo = lo - span * 0.15;
  const yHi = hi + span * 0.15;

  const t0 = sorted[0].date.getTime();
  const tSpan = Math.max(sorted[sorted.length - 1].date.getTime() - t0, 1);

  const x = (d: Date) => padX + ((d.getTime() - t0) / tSpan) * (W - padX * 2);
  const y = (v: number) => padTop + (1 - (v - yLo) / (yHi - yLo)) * (H - padTop - padBottom);

  const line = sorted.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.date)},${y(p.weight)}`).join(' ');
  const trend = sorted.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.date)},${y(avg[i])}`).join(' ');
  const area = `${line} L${x(sorted[sorted.length - 1].date)},${H - padBottom} L${x(sorted[0].date)},${H - padBottom} Z`;

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const change = last.weight - first.weight;

  const fmtDate = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

  return (
    <figure className={cn('m-0', className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Weight from ${first.weight} on ${fmtDate(first.date)} to ${last.weight} on ${fmtDate(last.date)}`}
      >
        {/* Recessive gridlines at the range edges only. */}
        {[yHi, (yHi + yLo) / 2, yLo].map((v) => (
          <line
            key={v}
            x1={padX}
            x2={W - padX}
            y1={y(v)}
            y2={y(v)}
            stroke="hsl(var(--border))"
            strokeWidth={1}
          />
        ))}

        <defs>
          <linearGradient id="weightFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.18} />
            <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#weightFade)" />

        <path
          d={line}
          fill="none"
          stroke="hsl(var(--accent))"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={trend}
          fill="none"
          stroke="hsl(var(--muted-foreground))"
          strokeWidth={2}
          strokeDasharray="4 4"
          strokeLinecap="round"
        />

        {/* Every point gets a native tooltip; only the ends get a visible dot. */}
        {sorted.map((p, i) => (
          <circle key={i} cx={x(p.date)} cy={y(p.weight)} r={8} fill="transparent">
            <title>{`${fmtDate(p.date)} — ${p.weight} lb`}</title>
          </circle>
        ))}
        {[first, last].map((p, i) => (
          <circle
            key={`end-${i}`}
            cx={x(p.date)}
            cy={y(p.weight)}
            r={4}
            fill="hsl(var(--accent))"
            stroke="hsl(var(--background))"
            strokeWidth={2}
          />
        ))}

        <text
          x={padX}
          y={H - 6}
          fontSize={11}
          fill="hsl(var(--muted-foreground))"
          textAnchor="start"
        >
          {fmtDate(first.date)} · {first.weight}
        </text>
        <text
          x={W - padX}
          y={H - 6}
          fontSize={11}
          fill="hsl(var(--muted-foreground))"
          textAnchor="end"
        >
          {fmtDate(last.date)} · {last.weight}
        </text>
      </svg>

      <figcaption className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-accent" /> Daily
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-muted-foreground/70" /> 7-day average
        </span>
        <span className="ml-auto">
          {change === 0
            ? 'No change'
            : `${change > 0 ? '+' : ''}${change.toFixed(1)} lb over this range`}
        </span>
      </figcaption>
    </figure>
  );
}

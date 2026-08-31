/* eslint-disable @next/next/no-img-element */
import { spanLabel, type ComparePair } from '@/lib/photo-compare';

function dayLabel(d: Date) {
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * The first photo on file against the most recent one, per angle.
 *
 * Sits above the grid rather than inside it. The grid answers "what have I
 * taken"; this answers the only question anyone opens the screen for, so it
 * goes first and is always on — nothing to toggle, nothing to pick.
 *
 * Plain <img> for the same reason the grid uses one: these are signed URLs
 * on a private bucket that rotate hourly, so there is nothing stable for the
 * image optimizer to cache.
 */
export function PhotoCompare({ pairs }: { pairs: ComparePair[] }) {
  if (pairs.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {pairs.map((pair) => (
        <div key={pair.angle} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="readout text-[11px] uppercase tracking-wider text-foreground">
              {pair.angle}
            </span>
            <span className="readout text-[10px] uppercase text-muted-foreground">
              {spanLabel(pair.daysApart)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[
              { photo: pair.first, when: 'First' },
              { photo: pair.latest, when: 'Latest' },
            ].map(({ photo, when }) => (
              <figure key={photo.id} className="m-0 flex flex-col gap-1">
                {photo.url ? (
                  <img
                    src={photo.url}
                    alt={`${pair.angle} progress photo from ${dayLabel(photo.date)}`}
                    className="aspect-[3/4] w-full border border-border object-cover"
                  />
                ) : (
                  <div className="flex aspect-[3/4] w-full items-center justify-center border border-border bg-secondary/30">
                    <span className="text-xs text-muted-foreground">Unavailable</span>
                  </div>
                )}
                <figcaption className="readout text-[10px] uppercase text-muted-foreground">
                  {when} · {dayLabel(photo.date)}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

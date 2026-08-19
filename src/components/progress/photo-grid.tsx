/* eslint-disable @next/next/no-img-element */

export type PhotoTile = {
  id: string;
  date: Date;
  angle: string;
  url: string | null;
};

function dayLabel(d: Date) {
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Photos grouped by shoot date, newest first, so front/side/back from the
 * same day sit together and two dates are easy to compare by eye.
 *
 * Plain <img> rather than next/image on purpose: these are signed URLs on a
 * private bucket that rotate every hour, so there's nothing stable for the
 * image optimizer to cache.
 */
export function PhotoGrid({
  photos,
  action,
}: {
  photos: PhotoTile[];
  action?: (formData: FormData) => Promise<void>;
}) {
  if (photos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No photos yet. Same spot, same lighting, same time of day — that&apos;s what makes them
        worth comparing.
      </p>
    );
  }

  const byDate = new Map<number, PhotoTile[]>();
  for (const p of photos) {
    const k = p.date.getTime();
    if (!byDate.has(k)) byDate.set(k, []);
    byDate.get(k)!.push(p);
  }

  const dates = [...byDate.keys()].sort((a, b) => b - a);

  return (
    <div className="flex flex-col gap-5">
      {dates.map((k) => (
        <div key={k}>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {dayLabel(new Date(k))}
          </p>
          <ul className="grid grid-cols-3 gap-2">
            {byDate
              .get(k)!
              .sort((a, b) => a.angle.localeCompare(b.angle))
              .map((p) => (
                <li key={p.id} className="relative">
                  {p.url ? (
                    <img
                      src={p.url}
                      alt={`${p.angle} progress photo from ${dayLabel(p.date)}`}
                      className="aspect-[3/4] w-full rounded-xl border border-border object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[3/4] w-full items-center justify-center rounded-xl border border-border bg-secondary/30">
                      <span className="text-xs text-muted-foreground">Unavailable</span>
                    </div>
                  )}
                  <span className="mt-1 block text-center text-xs capitalize text-muted-foreground">
                    {p.angle}
                  </span>
                  {action && (
                    <form action={action} className="absolute right-1 top-1">
                      <input type="hidden" name="photoId" value={p.id} />
                      <button
                        type="submit"
                        aria-label={`Delete ${p.angle} photo from ${dayLabel(p.date)}`}
                        className="rounded-full bg-background/80 px-2 py-0.5 text-xs text-muted-foreground backdrop-blur hover:text-foreground"
                      >
                        ✕
                      </button>
                    </form>
                  )}
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

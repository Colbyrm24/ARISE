'use client';

/*
  An instant, rendered in the reader's own timezone.

  Every other date on a coaching screen is fine formatted on the server — a
  meal logged "3h ago" reads the same everywhere. A booked call is not: it is
  the one thing where being an hour out means somebody misses it. So this is a
  client component, and it formats with no timeZone option at all, which makes
  Intl use the browser's.

  suppressHydrationWarning because the server render necessarily uses the
  server's zone and the first client render corrects it. That mismatch is the
  intended behaviour here, not a bug to paper over.
*/

export function LocalTime({ iso, withZone = true }: { iso: string; withZone?: boolean }) {
  const date = new Date(iso);
  const text = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...(withZone ? { timeZoneName: 'short' as const } : {}),
  }).format(date);

  return (
    <time dateTime={iso} suppressHydrationWarning>
      {text}
    </time>
  );
}

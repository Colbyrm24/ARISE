'use client';

import { RotateCcw } from 'lucide-react';

/*
  What a client sees when something on the screen throws.

  There was no error boundary anywhere in the app — no error.tsx, no
  global-error.tsx, no componentDidCatch. So any throw in a server component
  or a server action replaced the whole page with Next's built-in
  "Application error: a server-side exception has occurred", a hex digest, and
  no way forward but the browser's back button.

  That is not a hypothetical. The billing card runs eight uncaught Prisma
  queries in one Promise.all, and `logSet` used to hand an out-of-range weight
  straight to a Decimal(6,2) column — a mid-workout typo took down the screen
  the client was training from, on their phone, in a gym.

  Two things matter here and nothing else does. Say, in words a person can
  act on, that the failure is on our side and their data is not gone. And give
  them a button that retries, because most of these are a dropped connection
  to Postgres and the second attempt works.

  Deliberately no digest, no stack, no "contact support with this code". The
  coach is one tap away in the app and the digest means nothing to either of
  them; what he needs is in the server logs, not read aloud down a phone.
*/
export function ErrorPanel({
  title = 'That did not load',
  body = 'Something on our end failed, not anything you did. Nothing you have logged is lost.',
  reset,
}: {
  title?: string;
  body?: string;
  reset: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-4 border border-destructive/40 bg-destructive/[0.06] p-6"
    >
      <div className="flex flex-col gap-2">
        <h2 className="display text-lg">{title}</h2>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>

      <button
        type="button"
        onClick={reset}
        className="flex h-11 items-center gap-2 border border-accent px-4 text-xs uppercase tracking-wider text-accent transition-colors hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60"
      >
        <RotateCcw size={14} />
        Try again
      </button>
    </div>
  );
}

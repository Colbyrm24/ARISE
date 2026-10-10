import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-16">
      <div aria-hidden className="viewport-frame" />
      {/*
        Light pooling up from the floor, brighter than the app-wide wash in
        globals.css. Sign-in is the first thing anyone sees, so this is the
        one screen that gets the full treatment.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[70vh] bg-[radial-gradient(ellipse_90%_100%_at_50%_100%,hsl(var(--system)/0.3),transparent_70%)]"
      />

      <div className="relative mb-12 flex flex-col items-center gap-3">
        {/*
          The wordmark is set twice: a blurred copy underneath throwing the
          bloom, and the sharp copy on top. One element with a text-shadow
          can't do this — the shadow clips long before it reads as light.
        */}
        <span className="relative isolate block">
          {/* Wide, saturated halo. Blur alone washes toward white, so the
              outer layer uses the deeper system blue to keep colour in it. */}
          <span
            aria-hidden
            className="display-wide absolute inset-0 z-0 select-none text-4xl text-[hsl(var(--system))] blur-[38px]"
          >
            ARISE
          </span>
          {/* Tight halo, right against the letterforms. */}
          <span
            aria-hidden
            className="display-wide absolute inset-0 z-[1] select-none text-4xl text-accent blur-[12px]"
          >
            ARISE
          </span>
          <span className="display-wide relative z-10 block text-4xl text-[hsl(var(--foreground))]">
            ARISE
          </span>
        </span>
        <span className="readout text-[10px] uppercase text-muted-foreground">
          Private coaching, done right
        </span>
      </div>

      <div className="relative w-full max-w-sm">{children}</div>

      {/*
        The only place a signed-out person can reach the legal pages.

        Everything else linking to /privacy is inside the app, behind a login,
        which is no use to the two audiences who actually need to read it before
        there is an account: somebody deciding whether to sign up, and a
        reviewer at Apple or Stripe checking the policy exists and is reachable
        without credentials. Kept faint and below the card — present, not
        competing with the sign-in button.
      */}
      <nav className="relative mt-12 flex gap-6">
        <Link
          href="/privacy"
          className="readout text-[10px] uppercase text-muted-foreground transition-colors hover:text-accent"
        >
          Privacy
        </Link>
        <Link
          href="/terms"
          className="readout text-[10px] uppercase text-muted-foreground transition-colors hover:text-accent"
        >
          Terms
        </Link>
      </nav>
    </div>
  );
}

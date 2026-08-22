import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Button } from '@/components/ui/button';
import { TRIGGERS, TRIGGER_LABELS, QUIET_DAYS } from '@/lib/auto-message';
import { saveAutoMessages } from './actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SignOutButton } from '@/components/client/sign-out-button';
import { PushToggle } from '@/components/push-toggle';

export default async function CoachSettingsPage() {
  const user = await getCurrentUser();

  const autoMessages = user
    ? await prisma.autoMessage.findMany({
        where: { coachId: user.id, trigger: { in: [...TRIGGERS] } },
        orderBy: [{ trigger: 'asc' }, { position: 'asc' }],
      })
    : [];

  const byTrigger = new Map<string, string[]>();
  for (const m of autoMessages) {
    if (!byTrigger.has(m.trigger)) byTrigger.set(m.trigger, []);
    byTrigger.get(m.trigger)!.push(m.body);
  }

  const BLURB: Record<string, string> = {
    daily_check_in:
      'Goes out each morning to every active client — the line you currently paste into every thread one at a time.',
    gone_quiet: `For anyone who hasn't sent you anything in ${QUIET_DAYS} days. This is the one that saves people, because going quiet is the step before leaving and it's also when they're least likely to message first.`,
    rest_day: 'For a client whose programme says today is a rest day, so the app doesn\'t go silent on the day the habit is most fragile.',
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="display text-2xl">Settings</h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <p className="text-sm">{user?.profile?.fullName ?? 'Your name'}</p>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          {/* The coach wants these more than anyone — a client message at 6am
              is exactly the thing worth being interrupted for. */}
          <PushToggle vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Calls</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            {user?.profile?.bookingLocation
              ? 'Clients join on:'
              : 'No call link set yet, so bookings arrive with nowhere to join.'}
          </p>
          {user?.profile?.bookingLocation && (
            <p className="break-all text-sm">{user.profile.bookingLocation}</p>
          )}
          <Link
            href="/coach/schedule"
            className="readout w-fit border border-border px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:border-accent/60 hover:text-accent"
          >
            Open hours and call link
          </Link>
        </CardContent>
      </Card>

      {/*
        Messages that send themselves.

        One card per trigger rather than one big list, because the three are
        answering different questions and a coach editing the quiet-client line
        is in a different frame of mind from one editing the morning hello.
      */}
      <Card>
        <CardHeader>
          <CardTitle>Automatic messages</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <p className="text-sm text-muted-foreground">
            One per line, in your words. They send from your account into your normal thread, so a
            client can reply like any other message. Each list rotates so nobody gets the same
            sentence twice in a row — and at most one of these ever sends to a client in a day,
            never to someone you&apos;ve already spoken to yourself.
          </p>

          {TRIGGERS.map((t) => {
            const lines = byTrigger.get(t) ?? [];
            return (
              <form
                key={t}
                action={saveAutoMessages}
                className="flex flex-col gap-2 border-t border-border/60 pt-5 first:border-t-0 first:pt-0"
              >
                <input type="hidden" name="trigger" value={t} />
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="readout text-[11px] uppercase tracking-wider text-accent glow-soft">
                    {TRIGGER_LABELS[t]}
                  </span>
                  <span className="readout text-[10px] uppercase tracking-wider text-muted-foreground">
                    [{lines.length} in rotation]
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{BLURB[t]}</p>
                <textarea
                  name="messages"
                  rows={5}
                  defaultValue={lines.join('\n')}
                  className="w-full border border-input bg-secondary/40 p-3 text-sm leading-relaxed focus-visible:border-accent/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
                />
                <Button type="submit" size="sm" variant="outline" className="w-fit">
                  Save
                </Button>
                {lines.length === 0 && (
                  <p className="readout border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
                    Nothing in rotation, so this one never sends. Load your program on the Programs
                    screen to get the defaults, or write your own above.
                  </p>
                )}
              </form>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Brand</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Brand name, logo and accent colour aren&apos;t editable here yet — they live in the
            code for now.
          </p>
        </CardContent>
      </Card>

      <div className="max-w-xs">
        <SignOutButton />
      </div>
    </div>
  );
}

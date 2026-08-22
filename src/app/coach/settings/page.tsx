import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Button } from '@/components/ui/button';
import { REST_DAY } from '@/lib/auto-message';
import { saveRestDayMessages } from './actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SignOutButton } from '@/components/client/sign-out-button';
import { PushToggle } from '@/components/push-toggle';

export default async function CoachSettingsPage() {
  const user = await getCurrentUser();

  const restDayMessages = user
    ? await prisma.autoMessage.findMany({
        where: { coachId: user.id, trigger: REST_DAY },
        orderBy: { position: 'asc' },
      })
    : [];

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

      {/* A rest day is the day a client is most likely to drift — nothing is
          asked of them, so nothing arrives. These go out on their own so the
          app doesn't go silent on exactly the wrong day. */}
      <Card>
        <CardHeader>
          <CardTitle>Rest day messages</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            One per line. On a client&apos;s rest day one of these sends itself from your account,
            into your normal thread with them — they can reply to it like any other message. It
            rotates through the list so nobody gets the same line twice in a row, and never sends
            more than once a day.
          </p>
          <form action={saveRestDayMessages} className="flex flex-col gap-3">
            <textarea
              name="messages"
              rows={7}
              defaultValue={restDayMessages.map((m) => m.body).join('\n')}
              placeholder="Rest day today my man. Get your steps in and let the body recover"
              className="w-full border border-input bg-secondary/40 p-3 text-sm leading-relaxed focus-visible:border-accent/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
            />
            <div className="flex items-center gap-3">
              <Button type="submit" size="sm" variant="outline" className="w-fit">
                Save messages
              </Button>
              <span className="readout text-[10px] uppercase tracking-wider text-muted-foreground">
                [{restDayMessages.length} in rotation]
              </span>
            </div>
          </form>
          {restDayMessages.length === 0 && (
            <p className="readout border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
              Nothing in rotation, so no rest-day message will send. Load your program on the
              Programs screen to get the default five, or write your own above.
            </p>
          )}
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

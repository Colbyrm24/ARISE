import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SignOutButton } from '@/components/client/sign-out-button';
import { PushToggle } from '@/components/push-toggle';

export default async function CoachSettingsPage() {
  const user = await getCurrentUser();

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

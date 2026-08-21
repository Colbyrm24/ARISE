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
          <CardTitle>Brand & Defaults</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Brand name, logo, accent color, default goals, and contract templates will be editable
            here without touching any code — coming as later phases ship.
          </p>
        </CardContent>
      </Card>

      <div className="max-w-xs">
        <SignOutButton />
      </div>
    </div>
  );
}

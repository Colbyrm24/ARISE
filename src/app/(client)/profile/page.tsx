import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { SignOutButton } from '@/components/client/sign-out-button';
import { PushToggle } from '@/components/push-toggle';
import { HealthSync } from '@/components/health-sync';
import { prisma } from '@/lib/prisma';

const statusLabels: Record<string, string> = {
  lead: 'Lead',
  payment_pending: 'Payment Pending',
  paid: 'Paid',
  contract_pending: 'Contract Pending',
  onboarding: 'Onboarding',
  active: 'Active',
  paused: 'Paused',
  ending_soon: 'Ending Soon',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export default async function ProfilePage() {
  const user = await getCurrentUser();
  const healthToken = user
    ? await prisma.healthToken.findUnique({ where: { clientId: user.id } })
    : null;
  const initials = (user?.profile?.fullName ?? user?.email ?? '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Profile</h1>
      </header>

      <Card>
        <CardContent className="pt-6">
          <PushToggle vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <HealthSync
            hasToken={Boolean(healthToken)}
            lastUsed={
              healthToken?.lastUsedAt
                ? healthToken.lastUsedAt.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })
                : null
            }
          />
        </CardContent>
      </Card>

      {/*
        Booking lives here rather than in the bottom bar. Five items is already
        the most a phone bar carries well, and a call is something people book
        every few weeks — not a screen they open daily.
      */}
      <Card>
        <CardContent className="pt-6">
          <Link
            href="/book"
            className="flex items-center justify-between gap-3 text-sm transition-colors hover:text-accent"
          >
            <span className="flex items-center gap-3">
              <CalendarDays size={16} className="text-accent" />
              Book a call with your coach
            </span>
            <span className="readout text-[10px] uppercase text-muted-foreground">Open</span>
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center gap-4 pt-6">
          <Avatar className="h-14 w-14">
            <AvatarImage src={user?.profile?.avatarUrl ?? undefined} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-base font-medium">{user?.profile?.fullName ?? 'Your name'}</p>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between pt-6">
          <p className="text-sm text-muted-foreground">Coaching status</p>
          <Badge variant="accent">
            {statusLabels[user?.clientRecord?.status ?? 'lead']}
          </Badge>
        </CardContent>
      </Card>

      {/* Progress, check-ins, and account settings expand here in later phases. */}

      <SignOutButton />
    </div>
  );
}

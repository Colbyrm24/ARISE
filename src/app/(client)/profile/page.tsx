import Link from 'next/link';
import { CalendarDays, Bell, LineChart, ClipboardCheck } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { Card, CardContent } from '@/components/ui/card';
import { BackgroundPicker } from '@/components/client/background-picker';
import { backgroundOf } from '@/lib/backgrounds';
import { Badge } from '@/components/ui/badge';
import { SignOutButton } from '@/components/client/sign-out-button';
import { PushToggle } from '@/components/push-toggle';
import { HealthSync } from '@/components/health-sync';
import { prisma } from '@/lib/prisma';
import { avatarSrc } from '@/lib/avatars';
import { zoneOf } from '@/lib/day';
import { AvatarUpload } from '@/components/client/avatar-upload';
import { CoachingPlanCard } from '@/components/client/coaching-plan-card';

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

      {/*
        Above the toggles on purpose. What somebody bought and how far
        through it they are outranks a notification switch.
      */}
      {user && <CoachingPlanCard clientId={user.id} timeZone={zoneOf(user.profile)} />}

      <Card>
        <CardContent className="pt-6">
          <PushToggle vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <HealthSync
            hasToken={Boolean(healthToken)}
            /*
              Their evening, not the server's. lastUsedAt is an instant, and
              formatting an instant with no timeZone uses whatever the host
              is set to — UTC on Vercel. HealthSync tells the client to run
              the export in the evening, so somebody in Los Angeles whose
              shortcut fired at 7pm read "Last received Sep 2" on the evening
              of the 1st: a date that had not happened yet where they were.
            */
            lastUsed={
              healthToken?.lastUsedAt
                ? healthToken.lastUsedAt.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    timeZone: zoneOf(user?.profile),
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
      {/*
        Progress and the weekly check-in were two and three taps deep — the
        only route in was a small weight tile on Today, and the check-in was
        inside that. A client who never tapped it never found either.
      */}
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          {[
            { href: '/progress', label: 'Progress and photos', icon: LineChart },
            { href: '/check-in', label: 'Weekly check-in', icon: ClipboardCheck },
          ].map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center justify-between gap-3 text-sm transition-colors hover:text-accent"
            >
              <span className="flex items-center gap-3">
                <Icon size={16} className="text-accent" />
                {label}
              </span>
              <span className="readout text-[10px] uppercase text-muted-foreground">Open</span>
            </Link>
          ))}
        </CardContent>
      </Card>

      {/*
        Updates only ever had one entry point — a badge on Today that vanished
        the moment it was read. Opening the page marked everything read, so the
        history became unreachable by design.
      */}
      <Card>
        <CardContent className="pt-6">
          <Link
            href="/notifications"
            className="flex items-center justify-between gap-3 text-sm transition-colors hover:text-accent"
          >
            <span className="flex items-center gap-3">
              <Bell size={16} className="text-accent" />
              Updates
            </span>
            <span className="readout text-[10px] uppercase text-muted-foreground">Open</span>
          </Link>
        </CardContent>
      </Card>

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
          <AvatarUpload src={avatarSrc(user?.profile)} initials={initials} />
          <div>
            <p className="text-base font-medium">{user?.profile?.fullName ?? 'Your name'}</p>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
            <p className="readout mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              Tap the photo to change it
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <BackgroundPicker current={backgroundOf(user?.profile?.background)} />
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

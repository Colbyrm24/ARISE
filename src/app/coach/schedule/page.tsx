import { X } from 'lucide-react';
import { requireCoach } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SystemWindow, SystemWindowContent } from '@/components/ui/system-window';
import { WEEKDAY_NAMES, formatMinute, formatSlotTime } from '@/lib/schedule';
import { upcomingForCoach, timeZoneOf, BOOK_AHEAD_DAYS } from '@/lib/booking';
import {
  addAvailability,
  removeAvailability,
  cancelBookingAsCoach,
  setBookingLocation,
  setTimezone,
} from './actions';

export const dynamic = 'force-dynamic';

const fieldClass =
  'h-9 min-w-0 rounded-none border border-input bg-secondary/40 px-2 text-sm placeholder:text-muted-foreground focus-visible:border-accent/60 focus-visible:outline-none';
const selectClass =
  'readout h-9 rounded-none border border-input bg-secondary/40 px-2 text-[11px] uppercase tracking-wider focus-visible:border-accent/60 focus-visible:outline-none';

// A short list beats a 400-entry dropdown nobody scrolls. Anything missing can
// still be typed, because the action validates against Intl rather than this.
const COMMON_ZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
];

export default async function CoachSchedulePage() {
  const coach = await requireCoach();
  const tz = timeZoneOf(coach.profile);

  const [availability, upcoming] = await Promise.all([
    prisma.coachAvailability.findMany({
      where: { coachId: coach.id, active: true },
      orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
    }),
    upcomingForCoach(coach.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="display text-2xl">Schedule</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          When you&apos;re open, and who&apos;s booked in.
        </p>
      </div>

      <SystemWindow title="Booked" meta={`[${upcoming.length}]`}>
        <SystemWindowContent className="pt-4">
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing booked. Clients see your open times on their own screen and pick one.
            </p>
          ) : (
            <ul className="flex flex-col">
              {upcoming.map((b) => (
                <li
                  key={b.id}
                  className="flex flex-col gap-1 border-b border-border/50 py-2 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{b.clientName}</p>
                    {b.note && <p className="mt-0.5 text-xs text-muted-foreground">{b.note}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="readout text-[11px] uppercase text-accent">
                      {new Intl.DateTimeFormat('en-US', {
                        timeZone: tz,
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      }).format(b.startsAt)}{' '}
                      {formatSlotTime(b.startsAt, tz)}
                    </span>
                    <form action={cancelBookingAsCoach} className="flex">
                      <input type="hidden" name="id" value={b.id} />
                      <button
                        type="submit"
                        aria-label={`Cancel ${b.clientName}'s call`}
                        className="p-1 text-muted-foreground transition-colors hover:text-destructive"
                      >
                        <X size={14} />
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SystemWindowContent>
      </SystemWindow>

      <Card>
        <CardHeader>
          <CardTitle>Open hours</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            Set in {tz.replace('_', ' ')}. These are weekly and repeat, so a daylight saving change
            keeps them at the same hour rather than shifting them by one.
          </p>

          {availability.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              None set, so clients have nothing to book. Add a window below.
            </p>
          ) : (
            <ul className="flex flex-col">
              {availability.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/50 py-2 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 text-sm">
                    {WEEKDAY_NAMES[a.weekday]}
                    <span className="readout ml-2 text-[10px] uppercase text-muted-foreground">
                      {formatMinute(a.startMinute)} – {formatMinute(a.endMinute)} ·{' '}
                      {a.slotMinutes} min
                    </span>
                  </span>
                  <form action={removeAvailability} className="flex shrink-0">
                    <input type="hidden" name="id" value={a.id} />
                    <button
                      type="submit"
                      aria-label="Remove window"
                      className="p-1 text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <X size={14} />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <form
            action={addAvailability}
            className="flex flex-wrap items-end gap-2 border-t border-border/60 pt-3"
          >
            <select name="weekday" defaultValue="1" aria-label="Day" className={selectClass}>
              {WEEKDAY_NAMES.map((name, i) => (
                <option key={name} value={i}>
                  {name}
                </option>
              ))}
            </select>
            <label className="flex flex-col gap-1">
              <span className="readout text-[10px] uppercase text-muted-foreground">From</span>
              <input type="time" name="start" defaultValue="09:00" className={fieldClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="readout text-[10px] uppercase text-muted-foreground">To</span>
              <input type="time" name="end" defaultValue="17:00" className={fieldClass} />
            </label>
            <select
              name="slotMinutes"
              defaultValue="30"
              aria-label="Call length"
              className={selectClass}
            >
              {[15, 20, 30, 45, 60].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
            <Button type="submit" size="sm" variant="secondary">
              Add
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Where calls happen</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form action={setBookingLocation} className="flex flex-col gap-2">
            <input
              name="location"
              defaultValue={coach.profile?.bookingLocation ?? ''}
              maxLength={300}
              placeholder="Your Meet link, Zoom room or phone number"
              aria-label="Booking location"
              className={`w-full ${fieldClass}`}
            />
            <p className="text-xs text-muted-foreground">
              Copied onto each booking as it&apos;s made, so changing it later can&apos;t rewrite
              where a call that already happened was held.
            </p>
            <Button type="submit" size="sm" variant="ghost" className="self-start">
              Save
            </Button>
          </form>

          <form action={setTimezone} className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
            <span className="readout text-[10px] uppercase text-muted-foreground">Your timezone</span>
            <select name="timezone" defaultValue={tz} aria-label="Timezone" className={selectClass}>
              {[...new Set([tz, ...COMMON_ZONES])].map((z) => (
                <option key={z} value={z}>
                  {z.replace('_', ' ')}
                </option>
              ))}
            </select>
            <Button type="submit" size="sm" variant="ghost">
              Save
            </Button>
          </form>

          <p className="text-xs text-muted-foreground">
            Clients can book up to {BOOK_AHEAD_DAYS} days out, and never less than two hours from
            now.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

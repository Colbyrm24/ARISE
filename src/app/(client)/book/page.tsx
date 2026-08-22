import { X } from 'lucide-react';
import { requireEntitledClient } from '@/lib/auth';
import { SystemWindow, SystemWindowContent } from '@/components/ui/system-window';
import { BookSlots } from '@/components/book-slots';
import { coachForClient, openSlotsFor, upcomingForClient, timeZoneOf, BOOK_AHEAD_DAYS } from '@/lib/booking';
import { cancelBooking } from './actions';
import { LocalTime } from '@/components/local-time';

export const dynamic = 'force-dynamic';

export default async function BookPage() {
  const user = await requireEntitledClient();
  const coach = await coachForClient(user.id);

  const [days, upcoming] = await Promise.all([
    coach ? openSlotsFor(coach.id, timeZoneOf(coach.profile)) : Promise.resolve([]),
    upcomingForClient(user.id),
  ]);

  // Instants only. Every label is formatted in the browser so it reads in the
  // client's own timezone rather than the coach's — see book-slots.tsx.
  const slots = days.flatMap((d) => d.slots.map((s) => s.startsAt.toISOString()));

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold">Book a call</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a time in the next {BOOK_AHEAD_DAYS} days. Times are shown in your timezone.
        </p>
      </header>

      {upcoming.length > 0 && (
        <SystemWindow title="Booked">
          <SystemWindowContent className="pt-4">
            <ul className="flex flex-col">
              {upcoming.map((b) => (
                <li
                  key={b.id}
                  className="flex flex-col gap-1 border-b border-border/50 py-2 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                >
                  <div className="min-w-0">
                    <p className="readout text-sm text-accent">
                      <LocalTime iso={b.startsAt.toISOString()} />
                    </p>
                    {b.location && (
                      <p className="mt-0.5 break-all text-xs text-muted-foreground">{b.location}</p>
                    )}
                  </div>
                  {/* self-start, or on a phone the column layout stretches
                      this to the full width and a small destructive action
                      becomes the biggest control on the card. */}
                  <form action={cancelBooking} className="flex shrink-0 self-start">
                    <input type="hidden" name="id" value={b.id} />
                    <button
                      type="submit"
                      aria-label="Cancel this call"
                      className="readout flex items-center gap-1 border border-border/70 px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:border-destructive/60 hover:text-destructive"
                    >
                      <X size={12} /> Cancel
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </SystemWindowContent>
        </SystemWindow>
      )}

      <SystemWindow title="Open times">
        <SystemWindowContent className="pt-4">
          {!coach ? (
            <p className="text-sm text-muted-foreground">
              No coach is set up to take bookings yet.
            </p>
          ) : (
            <BookSlots slots={slots} />
          )}
        </SystemWindowContent>
      </SystemWindow>
    </div>
  );
}

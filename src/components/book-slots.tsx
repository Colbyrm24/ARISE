'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { bookSlot } from '@/app/(client)/book/actions';

/*
  Picking a time.

  The server sends instants and nothing else. Every label on this screen is
  formatted here, in the browser, which means it lands in the CLIENT's own
  timezone rather than the coach's.

  That is not a detail. A client in Arizona shown "2:00 PM" that turns out to
  have been Eastern is the single worst thing a booking screen can do, and it
  is exactly what happens if the server formats these — the server only knows
  the coach's zone.
*/

export function BookSlots({ slots }: { slots: string[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const days = useMemo(() => {
    const dayFmt = new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
    const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

    const groups = new Map<string, { label: string; slots: { iso: string; label: string }[] }>();
    for (const iso of slots) {
      const date = new Date(iso);
      const key = dayFmt.format(date);
      const entry = groups.get(key) ?? { label: key, slots: [] };
      entry.slots.push({ iso, label: timeFmt.format(date) });
      groups.set(key, entry);
    }
    return [...groups.values()];
  }, [slots]);

  async function submit(formData: FormData) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    formData.set('startsAt', selected);
    try {
      const res = await bookSlot(formData);
      if (!res.ok) setError(res.error);
      else setSelected(null);
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (slots.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing open right now. Your coach will add times, or just message them.
      </p>
    );
  }

  return (
    <form action={submit} className="flex flex-col gap-5">
      {days.map((day) => (
        <div key={day.label} className="flex flex-col gap-2">
          <span className="readout text-[10px] uppercase tracking-wider text-muted-foreground">
            {day.label}
          </span>
          <div className="flex flex-wrap gap-2">
            {day.slots.map((slot) => {
              const active = selected === slot.iso;
              return (
                <button
                  key={slot.iso}
                  type="button"
                  onClick={() => setSelected(active ? null : slot.iso)}
                  aria-pressed={active}
                  // min-h-11 keeps these a real tap target on a phone; a 28px
                  // pill of monospace is not something you hit while walking.
                  className={`readout min-h-11 border px-3 py-2 text-[11px] uppercase tracking-wider transition-colors ${
                    active
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-border/70 text-muted-foreground hover:border-accent/50 hover:text-foreground'
                  }`}
                >
                  {slot.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex flex-col gap-2 border-t border-border/60 pt-4">
        <input
          name="note"
          maxLength={300}
          placeholder="Anything you want to cover? (optional)"
          className="h-10 w-full rounded-none border border-input bg-secondary/40 px-3 text-sm placeholder:text-muted-foreground focus-visible:border-accent/60 focus-visible:outline-none"
        />
        <Button type="submit" size="sm" disabled={!selected || busy} className="self-start">
          {busy ? 'Booking…' : selected ? 'Book it' : 'Pick a time'}
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </form>
  );
}

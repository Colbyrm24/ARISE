'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';
import { Link2, Link2Off, UserMinus, UserPlus } from 'lucide-react';
import { SystemWindow, SystemWindowContent } from '@/components/ui/system-window';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { SubscribeState } from '@/app/coach/programs/[id]/subscriber-actions';

/*
  Summary & Subscribers, the way Trainerize lays it out: who is on this
  program, where each of them is in it today, and Add subscribers.

  It replaced the one-client Deploy form. Adding a subscriber IS a deploy —
  Day 1 on the start date — that also records the subscription, so later
  edits to the program reach their future days. Remove and Unlink each take
  two taps, because one deletes a client's upcoming sessions and the other
  quietly stops them getting changes.
*/

export type SubscriberRow = {
  id: string;
  clientId: string;
  name: string;
  /** "Nov 2, 2026", or null for an assignment from before start dates. */
  start: string | null;
  /** "Week 5 - 8 · week 2", "Starts in 3 days", "Finished"… */
  where: string;
  linked: boolean;
  /** Why this one doesn't follow the master even though it is linked. */
  syncNote: string | null;
};

const fieldClass =
  'flex h-10 w-full border border-input bg-secondary/40 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const labelClass = 'readout text-[10px] uppercase tracking-wider text-muted-foreground';
const ARMED_MS = 5000;

function AddButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending || count === 0} className="w-full sm:w-auto">
      <UserPlus size={14} />
      {pending ? 'Writing calendars…' : count > 1 ? `Add ${count} subscribers` : 'Add subscriber'}
    </Button>
  );
}

/** Two taps, the second naming what happens to whom. */
function ConfirmAction({
  action,
  id,
  label,
  confirm,
  icon,
  danger,
}: {
  action: (formData: FormData) => void | Promise<void>;
  id: string;
  label: string;
  confirm: string;
  icon: React.ReactNode;
  danger?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), ARMED_MS);
    return () => clearTimeout(t);
  }, [armed]);

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className={cn(
          'readout inline-flex items-center gap-1 text-[11px] uppercase text-muted-foreground',
          danger ? 'hover:text-destructive' : 'hover:text-foreground'
        )}
      >
        {icon}
        {label}
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="subscriptionId" value={id} />
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="readout text-[10px] uppercase text-muted-foreground hover:text-foreground"
      >
        Cancel
      </button>
      <ConfirmSubmit text={confirm} danger={danger} />
    </form>
  );
}

// Its own component so useFormStatus sees the form above it.
function ConfirmSubmit({ text, danger }: { text: string; danger?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        'readout border px-2 py-1 text-[10px] uppercase',
        danger ? 'border-destructive/60 text-destructive hover:bg-destructive/10' : 'border-accent/60 text-accent hover:bg-accent/10',
        pending && 'opacity-60'
      )}
    >
      {pending ? 'Working…' : text}
    </button>
  );
}

export function ProgramSubscribers({
  templateId,
  subscribers,
  clients,
  defaultStart,
  programWeeks,
  onCalendar,
  addSubscribers,
  removeSubscriber,
  unlinkSubscriber,
  relinkSubscriber,
}: {
  templateId: string;
  subscribers: SubscriberRow[];
  clients: { id: string; name: string }[];
  defaultStart: string;
  programWeeks: number;
  onCalendar: boolean;
  addSubscribers: (prev: SubscribeState, formData: FormData) => Promise<SubscribeState>;
  removeSubscriber: (formData: FormData) => Promise<void>;
  unlinkSubscriber: (formData: FormData) => Promise<void>;
  relinkSubscriber: (formData: FormData) => Promise<void>;
}) {
  const [state, action] = useFormState(addSubscribers, { ok: false, message: '' });
  const [open, setOpen] = useState(subscribers.length === 0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const subscribed = new Set(subscribers.map((s) => s.clientId));

  // A successful add closes the picker and clears it, so the list below is
  // where the coach looks next.
  useEffect(() => {
    if (state.ok) {
      setPicked(new Set());
      setOpen(false);
    }
  }, [state]);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <SystemWindow title="Subscribers" meta={`[${subscribers.length}]`}>
      <SystemWindowContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-prose text-xs text-muted-foreground">
            {onCalendar
              ? `Day 1 lands on each subscriber's start date and the program runs ${programWeeks} week${programWeeks === 1 ? '' : 's'}. Edits to the calendar or phases update every linked subscriber's future days — past, finished and hand-moved days never change.`
              : "This program deploys from its weekly pattern, which doesn't sync: edits reach a client when you add them again. Put something on the Calendar to make it a synced master program."}
          </p>
          {!open && (
            <Button type="button" size="sm" onClick={() => setOpen(true)}>
              <UserPlus size={14} />
              Add subscribers
            </Button>
          )}
        </div>

        {open && (
          <form action={action} className="flex flex-col gap-3 border border-border/70 p-3">
            <input type="hidden" name="templateId" value={templateId} />
            <span className={labelClass}>Clients</span>
            {clients.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active clients to add.</p>
            ) : (
              <ul className="grid max-h-64 gap-1 overflow-y-auto sm:grid-cols-2">
                {clients.map((c) => (
                  <li key={c.id}>
                    <label className="flex min-h-10 cursor-pointer items-center gap-2 border border-border/60 px-3 py-2 text-sm hover:border-accent/50">
                      <input
                        type="checkbox"
                        name="clientId"
                        value={c.id}
                        checked={picked.has(c.id)}
                        onChange={() => toggle(c.id)}
                        className="h-4 w-4 accent-[hsl(var(--accent))]"
                      />
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      {subscribed.has(c.id) && (
                        <span className="readout shrink-0 text-[10px] uppercase text-muted-foreground">on it</span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid gap-3 sm:grid-cols-[200px_1fr] sm:items-end">
              <label className="flex flex-col gap-1.5">
                <span className={labelClass}>Start date (Day 1)</span>
                <input name="startDate" type="date" required defaultValue={defaultStart} className={fieldClass} />
              </label>
              <p className="text-xs text-muted-foreground">
                Replaces each client&apos;s unfinished program days from that date on and makes this their
                program. Adding someone already on it restarts them from the new date.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <AddButton count={picked.size} />
              {subscribers.length > 0 && (
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="readout text-[11px] uppercase text-muted-foreground hover:text-foreground"
                >
                  Close
                </button>
              )}
            </div>
          </form>
        )}

        {state.message && (
          <p
            className={cn(
              'readout border px-3 py-2 text-xs',
              state.ok
                ? 'border-success/40 bg-success/10 text-success'
                : 'border-destructive/40 bg-destructive/10 text-destructive'
            )}
          >
            {state.message}
          </p>
        )}

        {subscribers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody is on this program yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border/60 border-y border-border/60">
            {subscribers.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/coach/clients/${s.clientId}/program`}
                      className="truncate text-sm font-medium hover:text-accent"
                    >
                      {s.name}
                    </Link>
                    <Badge variant={s.linked && !s.syncNote ? 'accent' : 'outline'}>
                      {s.linked ? 'Linked' : 'Unlinked'}
                    </Badge>
                  </div>
                  <p className="readout text-[11px] uppercase text-muted-foreground">
                    {s.start ? `Started ${s.start}` : 'Start date unknown'} · {s.where}
                  </p>
                  {s.syncNote && <p className="text-xs text-muted-foreground">{s.syncNote}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  {s.linked ? (
                    <ConfirmAction
                      action={unlinkSubscriber}
                      id={s.id}
                      label="Unlink"
                      confirm={`Stop syncing ${s.name}`}
                      icon={<Link2Off size={12} />}
                    />
                  ) : (
                    <form action={relinkSubscriber}>
                      <input type="hidden" name="subscriptionId" value={s.id} />
                      <button
                        type="submit"
                        className="readout inline-flex items-center gap-1 text-[11px] uppercase text-accent hover:underline"
                      >
                        <Link2 size={12} />
                        Relink
                      </button>
                    </form>
                  )}
                  <ConfirmAction
                    action={removeSubscriber}
                    id={s.id}
                    label="Remove"
                    confirm={`Remove ${s.name} and their upcoming days`}
                    icon={<UserMinus size={12} />}
                    danger
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </SystemWindowContent>
    </SystemWindow>
  );
}

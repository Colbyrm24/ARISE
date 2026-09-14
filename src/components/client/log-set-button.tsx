'use client';

import { useFormStatus } from 'react-dom';
import { Check, Loader2, Flag, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

/*
  The tick that says it heard you.

  The square used to be a decorative span sitting beside a small "LOG"
  caption that was the real submit — so the thing that looks like a checkbox
  did nothing when tapped. Making it the button fixed that, but only halfway:
  a plain submit in a server component shows no change at all until the
  action returns, and `logSet` does several sequential queries. In a gym on
  two bars that is a couple of seconds of a button that looks exactly as
  unpressed as it did before, which is indistinguishable from the original
  bug and gets tapped again and again.

  useFormStatus needs to be inside the form, which is why this is its own
  component rather than a prop on the page.

  It now also has to say WHICH row is in flight. Every set row used to be its
  own form, so `pending` could only ever mean this row. The page is now one
  form for the whole session — so that Finish carries the numbers instead of
  discarding them — and a bare `pending` would spin all fifteen ticks whenever
  any one was tapped. `useFormStatus` hands back the FormData being submitted,
  and the tick writes its own set id into it, which gives the per-row answer
  back.
*/
export function LogSetButton({
  logged,
  setNumber,
  setId,
}: {
  logged: boolean;
  setNumber: number;
  setId: string;
}) {
  const { pending, data } = useFormStatus();
  const mine = pending && data?.get('setId') === setId;

  return (
    <button
      type="submit"
      name="setId"
      value={setId}
      /*
        Only this row's button goes disabled. Disabling every tick on any
        submit would make a set of three feel like a screen that seizes up for
        a second each time you log one.
      */
      disabled={mine}
      aria-label={logged ? `Update set ${setNumber}` : `Log set ${setNumber}`}
      aria-pressed={logged}
      className={cn(
        'flex h-11 w-11 shrink-0 items-center justify-center border transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60',
        mine
          ? 'border-accent/60 text-accent'
          : logged
            ? 'border-success/60 bg-success/10 text-success hover:bg-success/20'
            : 'border-border/70 text-muted-foreground hover:border-accent/60 hover:text-accent'
      )}
    >
      {mine ? (
        <Loader2 size={18} className="animate-spin" />
      ) : (
        /* A ghosted tick rather than a second bordered square inside this
           one: the button already IS the box, and nesting two borders read
           as a control inside a control. */
        <Check size={18} className={logged ? '' : 'opacity-25'} />
      )}
    </button>
  );
}

/*
  Finishing the session.

  A plain `<Button type="submit">` before, with no pending state at all — the
  one button on the page that redirects and notifies the coach, and the only
  one that gave no sign it had been pressed. On the circuit path it was not
  idempotent either: a second submit found no open log to close and created a
  fresh completed one, so the coach was told twice and the client had two
  sessions for one workout.

  It also now says what is about to happen. "Finish workout" on a session with
  four sets still blank reads like "save my work", and until this change that
  reading was actively punished — the numbers were dropped and there was no
  way back into the session.
*/
export function FinishButton({
  remaining,
  action,
}: {
  remaining: number;
  /*
    The form's own action is `logSet`, so that every tick in the session
    submits to it without repeating itself fifteen times. This button is the
    one exception, and `formAction` is how a single button overrides it — so
    the action has to come in as a prop, because the button it belongs to
    lives in here.
  */
  action: (formData: FormData) => void | Promise<void>;
}) {
  const { pending, data } = useFormStatus();
  const mine = pending && data?.has('finish');

  return (
    <div className="flex flex-col gap-2">
      {remaining > 0 && (
        <p className="readout text-center text-[10px] uppercase leading-relaxed text-muted-foreground">
          {remaining} {remaining === 1 ? 'set' : 'sets'} still blank — finishing saves what you
          typed and closes the session
        </p>
      )}
      <button
        type="submit"
        formAction={action}
        name="finish"
        value="1"
        disabled={pending}
        className={cn(
          'flex h-12 w-full items-center justify-center gap-2 border text-sm font-semibold uppercase tracking-wider',
          'transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60',
          'border-accent bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-60'
        )}
      >
        {mine ? <Loader2 size={16} className="animate-spin" /> : <Flag size={16} />}
        {mine ? 'Finishing' : 'Finish workout'}
      </button>
    </div>
  );
}

/** Puts an accidentally-finished session back, so the client can carry on. */
export function ReopenButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        'flex h-11 w-full items-center justify-center gap-2 border border-border/70 text-xs uppercase tracking-wider',
        'text-muted-foreground transition-colors hover:border-accent/60 hover:text-accent',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60 disabled:opacity-60'
      )}
    >
      {pending ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
      Reopen this session
    </button>
  );
}

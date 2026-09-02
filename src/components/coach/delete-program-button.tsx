'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/*
  A confirmation step for the only irreversible button on the Programs list.

  Deleting a template deletes every Workout under it, and the delete is a
  cascade the coach cannot undo from anywhere in the app. It was a bare submit
  button sitting one flex gap from the chevron that opens the program — the
  two most different outcomes on the row, adjacent, on a screen used one-handed
  on a phone.

  Inline rather than window.confirm: a native dialog blocks the whole tab, is
  styled by the browser rather than by this app, and reads as a bug in a
  full-screen PWA. This is two taps, the second one naming the program so the
  coach is confirming a thing and not a gesture, and it steps back down on its
  own if they walk away.
*/

const ARMED_MS = 5000;

export function DeleteProgramButton({
  action,
  id,
  name,
}: {
  action: (formData: FormData) => void | Promise<void>;
  id: string;
  name: string;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
    Disarms itself. Without this, a coach who taps the bin, thinks better of
    it and scrolls away leaves a live one-tap delete sitting on the row for
    as long as the page stays open — which is a worse trap than the button
    this replaces, because it looks like it has already been dealt with.
  */
  useEffect(() => {
    if (!armed) return;
    timer.current = setTimeout(() => setArmed(false), ARMED_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [armed]);

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        title={`Delete ${name}`}
        aria-label={`Delete ${name}`}
        className="text-muted-foreground transition-colors hover:text-destructive"
      >
        <Trash2 size={16} />
      </button>
    );
  }

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="readout text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
      >
        Cancel
      </button>
      <Confirm name={name} />
    </form>
  );
}

/*
  Split out because useFormStatus only reports the status of a form ABOVE it
  in the tree — called in the same component as the <form>, it always answers
  "not submitting", and the button would stay pressable while the delete is
  in flight.
*/
function Confirm({ name }: { name: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={`Confirm deleting ${name}`}
      className={cn(
        'readout border border-destructive/60 px-2 py-1 text-[10px] uppercase tracking-wider text-destructive transition-colors',
        pending ? 'opacity-60' : 'hover:bg-destructive/10'
      )}
    >
      {pending ? 'Deleting…' : 'Delete for good'}
    </button>
  );
}

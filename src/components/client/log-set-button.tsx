'use client';

import { useFormStatus } from 'react-dom';
import { Check, Loader2 } from 'lucide-react';
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
*/
export function LogSetButton({ logged, setNumber }: { logged: boolean; setNumber: number }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={logged ? `Update set ${setNumber}` : `Log set ${setNumber}`}
      aria-pressed={logged}
      className={cn(
        'flex h-11 w-11 shrink-0 items-center justify-center border transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60',
        pending
          ? 'border-accent/60 text-accent'
          : logged
            ? 'border-success/60 bg-success/10 text-success hover:bg-success/20'
            : 'border-border/70 text-muted-foreground hover:border-accent/60 hover:text-accent'
      )}
    >
      {pending ? (
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

'use client';

import { useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';

/*
  Send, and the field emptying when you press it.

  Both live here rather than in the composer for the same reason: useFormStatus
  only reports on a form ABOVE it in the tree, so read from the component that
  renders the <form> it is always idle. Sitting inside the form, it sees the
  submission start.

  That matters more than a spinner. The composer posts a server action, and a
  server action does not reset an uncontrolled input on its own in React 18 —
  so the message you had just sent stayed sitting in the box looking unsent.
  The natural response is to press Send again, and people did, which is how the
  same sentence arrived twice. Clearing the moment the submission starts, not
  when the server answers, also means the box empties on the tap instead of a
  round trip later.

  The composer stays a plain server component doing a plain form post, so a
  message still sends on a phone whose JavaScript has not loaded yet. This
  simply does nothing in that case, which is the old behaviour.
*/
export function SendButton({ fieldName = 'body' }: { fieldName?: string }) {
  const { pending } = useFormStatus();
  const anchor = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!pending) return;

    /*
      Safe to empty. By the time pending flips, React has already read the
      FormData off this form — clearing the input now cannot take the message
      with it.
    */
    const field = anchor.current?.closest('form')?.elements.namedItem(fieldName);
    if (field instanceof HTMLInputElement) field.value = '';
  }, [pending, fieldName]);

  return (
    <>
      <span ref={anchor} aria-hidden className="hidden" />
      <Button type="submit" disabled={pending}>
        {pending ? 'Sending…' : 'Send'}
      </Button>
    </>
  );
}

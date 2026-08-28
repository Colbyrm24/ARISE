'use client';

import { useRef, useState, useTransition } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DraftResult } from '@/lib/coach-draft';

/*
  Writes a first draft into the composer. It does not send.

  The draft lands in the same box he would have typed into, so the next thing
  that happens is him reading it — and the message the client gets is the one
  he pressed Send on. There is no path from here to a delivered message that
  does not go through him, which is the point.
*/
export function DraftReplyButton({
  action,
  clientId,
}: {
  action: (formData: FormData) => Promise<DraftResult>;
  clientId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const anchor = useRef<HTMLButtonElement>(null);

  function draft() {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('clientId', clientId);
      const result = await action(formData);

      if (!result.text) {
        setError(result.error ?? 'Nothing came back.');
        return;
      }

      /*
        Reached through the form rather than through a ref on the input,
        because the input belongs to Composer and this button is only a guest
        inside it — Composer stays a plain server component that posts without
        JavaScript, and nothing about it has to know this button exists.
      */
      const form = anchor.current?.closest('form');
      const field = form?.elements.namedItem('body');
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
        field.value = result.text;
        field.focus();
        // Cursor at the end — he edits the tail far more often than the head.
        field.setSelectionRange(field.value.length, field.value.length);
      }
    });
  }

  return (
    <>
      <Button
        ref={anchor}
        type="button"
        variant="secondary"
        size="icon"
        onClick={draft}
        disabled={pending}
        aria-label="Draft a reply"
        title="Draft a reply"
      >
        <Sparkles className={pending ? 'h-4 w-4 animate-pulse' : 'h-4 w-4'} />
      </Button>
      {error && (
        <p role="status" className="absolute -top-6 right-0 text-xs text-destructive">
          {error}
        </p>
      )}
    </>
  );
}

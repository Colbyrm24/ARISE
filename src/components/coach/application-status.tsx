'use client';

import { useFormStatus } from 'react-dom';
import { APPLICATION_STATUSES } from '@/lib/application-fields';
import { setApplicationStatus } from '@/app/coach/applications/actions';

/*
  A status picker that saves the moment it changes — one tap on a phone
  instead of pick-then-press-save. The form still has a real submit button
  for anyone without JS.
*/

function Picker({ status }: { status: string }) {
  const { pending } = useFormStatus();
  return (
    <select
      name="status"
      defaultValue={status}
      disabled={pending}
      aria-label="Application status"
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className="readout h-9 border border-border bg-secondary/60 px-2 text-xs uppercase text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    >
      {APPLICATION_STATUSES.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

export function ApplicationStatus({ id, status }: { id: string; status: string }) {
  return (
    <form action={setApplicationStatus} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Picker status={status} />
      <noscript>
        <button type="submit" className="readout h-9 border border-border px-3 text-xs uppercase">
          Save
        </button>
      </noscript>
    </form>
  );
}

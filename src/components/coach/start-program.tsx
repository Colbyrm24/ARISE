'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { StartProgramState } from '@/app/coach/clients/[id]/program-actions';

/*
  The one form a coach fills in to put somebody on a program.

  Program, start date, how long — and the client's calendar is written and the
  program is theirs, in one press. Start date defaults to the CLIENT's today,
  worked out on the server, because that is the day that is right for them.
*/

const fieldClass =
  'flex h-11 w-full rounded-xl border border-input bg-secondary/40 px-4 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" className="w-fit" disabled={pending}>
      {pending ? 'Writing the calendar…' : label}
    </Button>
  );
}

export function StartProgramForm({
  clientId,
  programs,
  defaultStart,
  currentTemplateId,
  action,
}: {
  clientId: string;
  programs: { id: string; name: string }[];
  defaultStart: string;
  currentTemplateId?: string | null;
  action: (prev: StartProgramState, formData: FormData) => Promise<StartProgramState>;
}) {
  const [state, formAction] = useFormState(action, { ok: false, message: '' });

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="clientId" value={clientId} />

      <label className="flex flex-col gap-1.5">
        <span className="readout text-[10px] uppercase tracking-wider text-muted-foreground">Program</span>
        <select name="templateId" className={fieldClass} required defaultValue={currentTemplateId ?? ''}>
          <option value="" disabled>
            Pick a program…
          </option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="readout text-[10px] uppercase tracking-wider text-muted-foreground">Starts</span>
          <input name="startDate" type="date" required defaultValue={defaultStart} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="readout text-[10px] uppercase tracking-wider text-muted-foreground">Length</span>
          <select name="weeks" defaultValue="26" className={fieldClass}>
            <option value="4">4 weeks</option>
            <option value="8">8 weeks</option>
            <option value="12">12 weeks</option>
            <option value="26">6 months</option>
            <option value="52">1 year</option>
          </select>
        </label>
      </div>

      <Submit label={currentTemplateId ? 'Restart from this date' : 'Start program'} />

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
    </form>
  );
}

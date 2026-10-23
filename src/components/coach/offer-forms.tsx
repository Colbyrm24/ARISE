'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { OfferState } from '@/app/coach/split/actions';

/*
  The small client pieces of the Follow My Split screen: forms that report
  back in a line underneath, and a copy button for the page link.
*/

function Submit({ label, pending, variant }: { label: string; pending: string; variant?: 'primary' | 'outline' }) {
  const { pending: busy } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant ?? 'primary'} className="w-fit" disabled={busy}>
      {busy ? pending : label}
    </Button>
  );
}

export function OfferForm({
  action,
  submitLabel,
  pendingLabel,
  variant,
  className,
  children,
}: {
  action: (prev: OfferState, formData: FormData) => Promise<OfferState>;
  submitLabel: string;
  pendingLabel: string;
  variant?: 'primary' | 'outline';
  className?: string;
  children?: React.ReactNode;
}) {
  const [state, formAction] = useFormState(action, { ok: false, message: '' });
  return (
    <form action={formAction} className={cn('flex flex-col gap-3', className)}>
      {children}
      <Submit label={submitLabel} pending={pendingLabel} variant={variant} />
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

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="readout break-all border border-border/70 bg-secondary/30 px-3 py-2 text-sm text-accent hover:underline"
      >
        {url}
      </a>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          } catch {
            // Clipboard blocked; the link is right there to select.
          }
        }}
        className="readout inline-flex items-center gap-1.5 border border-border px-2.5 py-2 text-[10px] uppercase tracking-wider text-muted-foreground hover:border-accent/60 hover:text-accent"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

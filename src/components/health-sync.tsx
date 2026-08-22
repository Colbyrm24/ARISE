'use client';

import { useState } from 'react';
import { Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createHealthToken } from '@/app/(client)/profile/health-actions';

/*
  Setting up automatic step and weight sync.

  Being straight about what this is: there's no native app, so the phone can't
  be asked for HealthKit access directly. What it can do is post to a URL on a
  schedule, which iOS Shortcuts does natively and Health Auto Export does for
  free. That's less magic than a toggle and it actually works today.

  The token is shown once. Only its hash is stored, so there is no way to show
  it again — which is worth saying plainly at the moment somebody is looking
  at it, rather than discovering later.
*/

export function HealthSync({ hasToken, lastUsed }: { hasToken: boolean; lastUsed: string | null }) {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  async function issue() {
    setBusy(true);
    try {
      const res = await createHealthToken();
      setToken(res.token);
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard is blocked in plenty of contexts. The value is on screen
      // and selectable either way, so this is not worth an error message.
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-3 text-sm">
          <Activity size={16} className="text-accent" />
          Sync steps and weight
        </span>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={issue}>
          {busy ? '…' : hasToken ? 'New key' : 'Set up'}
        </Button>
      </div>

      {hasToken && !token && (
        <p className="readout text-[10px] uppercase leading-relaxed text-muted-foreground">
          {lastUsed ? `Last received ${lastUsed}.` : 'Set up, nothing received yet.'} A new key
          replaces the old one.
        </p>
      )}

      {!hasToken && !token && (
        <p className="readout text-[10px] uppercase leading-relaxed text-muted-foreground">
          Sends your daily steps and weight straight over, so you stop typing them in.
        </p>
      )}

      {token && (
        <div className="flex flex-col gap-3 border border-accent/30 bg-accent/[0.05] p-3">
          <p className="text-xs leading-relaxed">
            Copy this now. It is only shown once — only a hash of it is stored, so it can be
            replaced but never shown again.
          </p>

          <button
            type="button"
            onClick={() => copy(token)}
            className="readout break-all border border-border bg-secondary/40 p-2 text-left text-[11px] transition-colors hover:border-accent/60"
          >
            {token}
          </button>

          <details open={open} className="text-xs">
            <summary className="readout cursor-pointer text-[10px] uppercase tracking-wider text-muted-foreground">
              How to set it up
            </summary>
            <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-4 leading-relaxed text-muted-foreground">
              <li>Open Shortcuts on your iPhone and make a new shortcut.</li>
              <li>
                Add <span className="text-foreground">Get Contents of URL</span> and point it at{' '}
                <span className="readout break-all text-foreground">{origin}/api/health</span>.
              </li>
              <li>
                Set the method to <span className="text-foreground">POST</span>, add a header{' '}
                <span className="readout text-foreground">Authorization</span> with the value{' '}
                <span className="readout break-all text-foreground">Bearer {token}</span>.
              </li>
              <li>
                Set the request body to JSON with{' '}
                <span className="readout text-foreground">steps</span> and{' '}
                <span className="readout text-foreground">weight</span>, filled from Health.
              </li>
              <li>
                Under Automation, run it once a day — evening works best, since the step count is
                finished by then.
              </li>
            </ol>
          </details>

          {copied && (
            <p className="readout text-[10px] uppercase text-success">Copied</p>
          )}
        </div>
      )}
    </div>
  );
}

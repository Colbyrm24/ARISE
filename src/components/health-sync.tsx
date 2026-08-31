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
          Sync steps, weight and food
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
        <p className="text-xs leading-relaxed text-muted-foreground">
          Your iPhone sends your steps and weight over every evening, so you stop typing them
          in — and if you use MyFitnessPal, your food comes with it. Takes about three minutes to
          set up once, using a free app. Tap{' '}
          <span className="text-foreground">Set up</span> and the instructions come with it.
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

          {/*
            Rewritten because nobody was ever going to do the old version.

            It opened with "make a new shortcut", then "add Get Contents of
            URL", then "add a header Authorization" — instructions for a
            developer, given to somebody who hired a coach. The app below does
            the same job with two fields to paste into and no shortcut to
            build, and it was already the intended route; it just wasn't the
            one on screen. The hand-built shortcut stays, second, for anyone
            who would rather not install anything.
          */}
          <details open={open} className="text-xs">
            <summary className="readout cursor-pointer text-[10px] uppercase tracking-wider text-muted-foreground">
              How to set it up — about 3 minutes
            </summary>

            <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-accent">
              The easy way
            </p>
            <ol className="mt-1.5 flex list-decimal flex-col gap-1.5 pl-4 leading-relaxed text-muted-foreground">
              <li>
                On your iPhone, install <span className="text-foreground">Health Auto Export</span>{' '}
                from the App Store. It&apos;s free for this.
              </li>
              <li>
                Open it, go to <span className="text-foreground">Automations</span>, and add one.
                Choose <span className="text-foreground">REST API</span>.
              </li>
              <li>
                Paste this as the URL:
                <button
                  type="button"
                  onClick={() => copy(`${origin}/api/health`)}
                  className="readout mt-1 block w-full break-all border border-border bg-secondary/40 p-1.5 text-left text-[10px] text-foreground transition-colors hover:border-accent/60"
                >
                  {origin}/api/health
                </button>
              </li>
              <li>
                Add one header. Name it <span className="readout text-foreground">Authorization</span>
                , and paste this as the value:
                <button
                  type="button"
                  onClick={() => copy(`Bearer ${token}`)}
                  className="readout mt-1 block w-full break-all border border-border bg-secondary/40 p-1.5 text-left text-[10px] text-foreground transition-colors hover:border-accent/60"
                >
                  Bearer {token}
                </button>
              </li>
              <li>
                Pick <span className="text-foreground">Steps</span> and{' '}
                <span className="text-foreground">Weight</span> as the data, set it to run{' '}
                <span className="text-foreground">daily in the evening</span>, and turn the
                automation on. Evening matters — the day&apos;s step count isn&apos;t finished
                before then.
              </li>
              {/*
                The MyFitnessPal answer, and the reason it is a bullet point
                rather than an integration. MFP has no self-serve API, but it
                writes every meal you log into Apple Health — so ticking four
                more boxes in the same export brings your food across with
                your steps.
              */}
              <li>
                Already track food in <span className="text-foreground">MyFitnessPal</span>? Tick{' '}
                <span className="text-foreground">Dietary Energy</span>,{' '}
                <span className="text-foreground">Protein</span>,{' '}
                <span className="text-foreground">Carbohydrates</span> and{' '}
                <span className="text-foreground">Total Fat</span> as well. MyFitnessPal writes
                what you log into Apple Health, so your day&apos;s food comes over with it and you
                stop logging twice.
              </li>
            </ol>

            <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Or without installing anything
            </p>
            <ol className="mt-1.5 flex list-decimal flex-col gap-1.5 pl-4 leading-relaxed text-muted-foreground">
              <li>Open the Shortcuts app and make a new shortcut.</li>
              <li>
                Add <span className="text-foreground">Get Contents of URL</span>, point it at the
                URL above, set the method to <span className="text-foreground">POST</span> and add
                the <span className="readout text-foreground">Authorization</span> header above.
              </li>
              <li>
                Set the body to JSON with <span className="readout text-foreground">steps</span> and{' '}
                <span className="readout text-foreground">weight</span>, filled from Health. Add{' '}
                <span className="readout text-foreground">calories</span>,{' '}
                <span className="readout text-foreground">protein</span>,{' '}
                <span className="readout text-foreground">carbs</span> and{' '}
                <span className="readout text-foreground">fat</span> if you track food.
              </li>
              <li>Under Automation, run it once a day in the evening.</li>
            </ol>

            <p className="mt-3 leading-relaxed text-muted-foreground">
              On Android, or would rather not bother? Typing your steps into the Today screen works
              exactly the same — this only saves you the typing.
            </p>
          </details>

          {copied && (
            <p className="readout text-[10px] uppercase text-success">Copied</p>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import {
  AGE_RANGES,
  EMPTY_ANSWERS,
  EXPERIENCE,
  INVEST_READY,
  START_WHEN,
  checkAnswer,
  type ApplicationAnswers,
  type Choice,
} from '@/lib/application-fields';
import { cn } from '@/lib/utils';

/*
  The application, one question per screen.

  Built for a thumb on a phone that just came from an Instagram bio: the
  question sits at the top rather than centred, so the keyboard opening never
  shoves it around; the error line keeps its height whether or not there's an
  error; and choice questions move on by themselves the moment one is tapped.

  Validation here is the same rule set the server runs (lib/application-
  fields.ts), only so a typo is caught on the screen it was made on. The
  server re-checks everything.
*/

type Key = keyof ApplicationAnswers;

type StepDef =
  | { key: Key; kind: 'text' | 'email' | 'tel'; prompt: string; hint?: string; placeholder: string; optional?: boolean; autoComplete?: string }
  | { key: Key; kind: 'long'; prompt: string; hint?: string; placeholder: string }
  | { key: Key; kind: 'choice'; prompt: string; hint?: string; choices: Choice[] };

function steps(name: string): StepDef[] {
  const you = name.trim() ? `, ${name.trim().split(' ')[0]}` : '';
  return [
    { key: 'firstName', kind: 'text', prompt: "First, what's your name?", placeholder: 'First name', autoComplete: 'given-name' },
    { key: 'email', kind: 'email', prompt: `Good to meet you${you}. Best email?`, placeholder: 'you@email.com', autoComplete: 'email' },
    { key: 'phone', kind: 'tel', prompt: 'Best number to text you?', hint: "Optional. It's the fastest way I'll reach you.", placeholder: '(555) 123-4567', optional: true, autoComplete: 'tel' },
    { key: 'instagram', kind: 'text', prompt: 'Your Instagram?', hint: "Optional. So I know who's in my DMs.", placeholder: '@handle', optional: true },
    { key: 'ageRange', kind: 'choice', prompt: 'How old are you?', choices: AGE_RANGES },
    { key: 'goal', kind: 'long', prompt: 'What do you want to change?', hint: 'Your body, and how you feel walking into a room. Be specific.', placeholder: 'See my abs for the first time, lose the gut, keep it while still eating out…' },
    { key: 'obstacle', kind: 'long', prompt: "What's been stopping you?", hint: 'Be honest. This is the part I can actually help with.', placeholder: 'Time, consistency, no plan, food…' },
    { key: 'experience', kind: 'choice', prompt: 'Where are you with training right now?', choices: EXPERIENCE },
    { key: 'startWhen', kind: 'choice', prompt: 'How soon do you want to start?', choices: START_WHEN },
    {
      key: 'investReady',
      kind: 'choice',
      prompt: 'Coaching is a real investment. Are you ready to invest in yourself if it’s the right fit?',
      choices: INVEST_READY,
    },
  ];
}

const field =
  'w-full border-0 border-b-2 border-border bg-transparent px-0 pb-3 pt-1 text-2xl font-medium text-foreground placeholder:text-muted-foreground/40 focus:border-accent focus:outline-none focus:ring-0 sm:text-3xl';

export function ApplyForm({ source, instagramUrl }: { source: string | null; instagramUrl: string }) {
  const [answers, setAnswers] = useState<ApplicationAnswers>(EMPTY_ANSWERS);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const all = steps(answers.firstName);
  const step = all[index]!;
  const total = all.length;
  const isLast = index === total - 1;
  const value = answers[step.key];

  // Focus without scrolling: on iOS a plain focus() scrolls the field into
  // view and the whole screen jumps on every question.
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
  }, [index]);

  function set(key: Key, v: string) {
    setAnswers((a) => ({ ...a, [key]: v }));
    if (error) setError(null);
  }

  async function submit(final: ApplicationAnswers) {
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/coaching/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...final, source: source ?? undefined, company: honeypot }),
      });
      const data: { error?: string } = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That didn't go through. Try again in a minute.");
      setDone(true);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't go through. Try again in a minute.");
    } finally {
      setSending(false);
    }
  }

  function next(from: ApplicationAnswers = answers) {
    const problem = checkAnswer(step.key, from[step.key]);
    if (problem) {
      setError(problem);
      return;
    }
    if (isLast) {
      void submit(from);
      return;
    }
    setError(null);
    setIndex((i) => Math.min(i + 1, total - 1));
  }

  function back() {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setError(null);
    setIndex((i) => Math.max(i - 1, 0));
  }

  function choose(v: string) {
    const updated = { ...answers, [step.key]: v };
    setAnswers(updated);
    setError(null);
    // A beat so the tap visibly lands before the screen changes. The last
    // question waits for the Send button instead — sending is a decision.
    if (!isLast) advanceTimer.current = setTimeout(() => next(updated), 220);
  }

  if (done) return <Received name={answers.firstName} instagramUrl={instagramUrl} />;

  const counter = `${index + 1} of ${total}`;

  return (
    <div className="mx-auto flex min-h-[100svh] w-full max-w-2xl flex-col px-5 pb-8 sm:px-8">
      <header className="flex h-16 items-center justify-between">
        {index > 0 ? (
          <button
            type="button"
            onClick={back}
            className="-ml-2 flex h-10 items-center gap-1 px-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft size={16} /> Back
          </button>
        ) : (
          <Link
            href="/coaching"
            className="-ml-2 flex h-10 items-center gap-1 px-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft size={16} /> Exit
          </Link>
        )}
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {counter}
        </span>
      </header>

      {/* Progress: one rounded cell per question, filled in the page's orange. */}
      <div className="flex gap-1" aria-hidden>
        {all.map((s, i) => (
          <span
            key={s.key}
            className={cn(
              'h-1 flex-1 rounded-[999px] transition-all duration-300',
              i < index && 'bg-[hsl(var(--cta))]',
              i === index && 'bg-[hsl(var(--cta)/0.5)]',
              i > index && 'bg-border/60'
            )}
          />
        ))}
      </div>

      <form
        className="mt-12 flex flex-1 flex-col sm:mt-16"
        onSubmit={(e) => {
          e.preventDefault();
          next();
        }}
        noValidate
      >
        {/* The honeypot. Hidden from people and screen readers; bots fill it. */}
        <div aria-hidden className="pointer-events-none absolute left-0 top-0 h-px w-px overflow-hidden opacity-0">
          <label>
            Company
            <input
              type="text"
              name="company"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </label>
        </div>

        <div key={index} className="motion-safe:animate-fade-in">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cta">
            Question {index + 1}
            {'optional' in step && step.optional ? ' · optional' : ''}
          </p>
          <label htmlFor={`q-${step.key}`} className="mt-3 block text-balance text-2xl font-semibold leading-tight sm:text-[2rem]">
            {step.prompt}
          </label>
          {step.hint && <p className="mt-2 text-sm text-muted-foreground">{step.hint}</p>}

          <div className="mt-8">
            {step.kind === 'choice' ? (
              <div role="radiogroup" aria-labelledby={`q-${step.key}`} className="flex flex-col gap-2.5">
                <span id={`q-${step.key}`} className="sr-only">{step.prompt}</span>
                {step.choices.map((c, i) => {
                  const on = value === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => choose(c.value)}
                      className={cn(
                        'flex min-h-[56px] w-full items-center gap-4 rounded-[14px] border px-4 py-3 text-left text-[15px] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-base',
                        on
                          ? 'border-accent bg-accent/[0.1] text-foreground'
                          : 'border-border/60 bg-card/50 text-foreground/90 hover:border-accent/50'
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-6 w-6 shrink-0 items-center justify-center rounded-[999px] border text-[11px] font-semibold',
                          on ? 'border-accent bg-accent text-accent-foreground' : 'border-border text-muted-foreground'
                        )}
                      >
                        {String.fromCharCode(65 + i)}
                      </span>
                      {c.label}
                    </button>
                  );
                })}
              </div>
            ) : step.kind === 'long' ? (
              <textarea
                id={`q-${step.key}`}
                ref={inputRef}
                value={value}
                onChange={(e) => set(step.key, e.target.value)}
                placeholder={step.placeholder}
                rows={4}
                maxLength={1500}
                className={cn(field, 'resize-none text-lg leading-relaxed sm:text-xl')}
              />
            ) : (
              <input
                id={`q-${step.key}`}
                ref={inputRef}
                type={step.kind}
                inputMode={step.kind === 'tel' ? 'tel' : step.kind === 'email' ? 'email' : 'text'}
                autoComplete={step.autoComplete ?? 'off'}
                autoCapitalize={step.key === 'firstName' ? 'words' : 'none'}
                autoCorrect="off"
                spellCheck={false}
                value={value}
                onChange={(e) => set(step.key, e.target.value)}
                placeholder={step.placeholder}
                className={field}
              />
            )}
          </div>

          {/* Always takes its line, error or not, so nothing below it moves. */}
          <p role="alert" className="mt-3 min-h-[1.25rem] text-sm text-destructive">
            {error ?? ''}
          </p>
        </div>

        <div className="mt-auto flex flex-col gap-3 pt-8 sm:flex-row sm:items-center sm:justify-between">
          {(step.kind !== 'choice' || isLast) && (
            <button
              type="submit"
              disabled={sending || (isLast && !value)}
              className="btn-cta inline-flex h-14 w-full items-center justify-center rounded-[999px] px-10 text-base font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto"
            >
              {isLast
                ? sending
                  ? 'Sending…'
                  : 'Send application'
                : 'optional' in step && step.optional && !value.trim()
                  ? 'Skip'
                  : 'Continue'}
            </button>
          )}
          {step.kind !== 'choice' && step.kind !== 'long' && (
            <p className="readout hidden text-[10px] uppercase text-muted-foreground sm:block">Press Enter ↵</p>
          )}
        </div>
      </form>
    </div>
  );
}

function Received({ name, instagramUrl }: { name: string; instagramUrl: string }) {
  const first = name.trim().split(' ')[0];
  return (
    <div className="mx-auto flex min-h-[100svh] w-full max-w-2xl flex-col justify-center px-5 py-16 sm:px-8">
      <div className="surface-sheen lit-edge relative motion-safe:animate-fade-in border border-border px-6 py-10 sm:px-10 sm:py-12">
        <p className="readout text-[11px] uppercase text-success">
          [ Application received ]
        </p>
        <h1 className="display-wide mt-4 font-black text-3xl leading-[1.05] sm:text-5xl">
          Got it{first ? `, ${first}` : ''}.
        </h1>
        <div className="mt-6 flex flex-col gap-4 text-base leading-relaxed text-muted-foreground">
          <p>I read every application personally. Not an assistant, not a bot. Me.</p>
          <p>
            If it looks like a fit, I&apos;ll text or DM you within 24 hours to set up a call.
            Keep an eye on your phone.
          </p>
        </div>
        <div className="mt-8 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="readout text-[10px] uppercase text-muted-foreground">Status: pending review</p>
          <div className="flex gap-5">
            {instagramUrl && (
              <a href={instagramUrl} className="readout text-xs uppercase text-accent hover:underline">
                Instagram
              </a>
            )}
            <Link href="/coaching" className="readout text-xs uppercase text-accent hover:underline">
              Back to the page
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

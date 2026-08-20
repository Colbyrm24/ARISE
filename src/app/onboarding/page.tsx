import Link from 'next/link';
import { Check } from 'lucide-react';
import { requireClient } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ONBOARDING_STEPS, readAnswer } from '@/lib/onboarding';
import { saveOnboardingStep } from './actions';

const selectClass =
  'flex h-11 w-full rounded-xl border border-input bg-secondary/40 px-4 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const textareaClass =
  'w-full resize-none rounded-xl border border-border bg-secondary/30 p-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring';

/**
 * Client intake. Each step saves on its own so it can be done in pieces —
 * a client who fills in two sections on their phone and finishes the rest
 * later still gives the coach something to work with immediately.
 */
export default async function OnboardingPage() {
  const user = await requireClient();

  const responses = await prisma.onboardingResponse.findMany({
    where: { clientId: user.id },
  });
  type Saved = { answerJson: unknown; completedAt: Date | null };
  const byStep = new Map<string, Saved>(
    responses.map((r) => [r.stepKey, r as Saved])
  );

  const completed = ONBOARDING_STEPS.filter((s) => byStep.get(s.key)?.completedAt).length;
  const allDone = completed === ONBOARDING_STEPS.length;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Getting started
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Let&apos;s build your plan</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Four short sections. Each one saves on its own, so you can stop and come back.
        </p>
        <p className="mt-3 text-sm">
          <span className="font-medium">{completed}</span>
          <span className="text-muted-foreground"> of {ONBOARDING_STEPS.length} done</span>
        </p>
      </header>

      {ONBOARDING_STEPS.map((step) => {
        const saved = byStep.get(step.key);
        const answers = readAnswer(saved?.answerJson);
        const done = Boolean(saved?.completedAt);

        return (
          <Card key={step.key}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {step.title}
                {done && <Check size={16} className="text-accent" />}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{step.blurb}</p>
            </CardHeader>
            <CardContent>
              <form action={saveOnboardingStep} className="flex flex-col gap-4">
                <input type="hidden" name="stepKey" value={step.key} />

                {step.fields.map((field) => (
                  <div key={field.key} className="flex flex-col gap-1.5">
                    <label htmlFor={`${step.key}-${field.key}`} className="text-sm font-medium">
                      {field.label}
                      {field.required && <span className="text-muted-foreground"> *</span>}
                    </label>
                    {field.hint && (
                      <p className="text-xs text-muted-foreground">{field.hint}</p>
                    )}

                    {field.type === 'select' ? (
                      <select
                        id={`${step.key}-${field.key}`}
                        name={field.key}
                        className={selectClass}
                        defaultValue={answers[field.key] ?? ''}
                      >
                        <option value="">Choose…</option>
                        {field.options?.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : field.type === 'long' ? (
                      <textarea
                        id={`${step.key}-${field.key}`}
                        name={field.key}
                        rows={3}
                        maxLength={2000}
                        defaultValue={answers[field.key] ?? ''}
                        className={textareaClass}
                      />
                    ) : (
                      <Input
                        id={`${step.key}-${field.key}`}
                        name={field.key}
                        type={field.type === 'number' ? 'number' : 'text'}
                        inputMode={field.type === 'number' ? 'decimal' : undefined}
                        defaultValue={answers[field.key] ?? ''}
                      />
                    )}
                  </div>
                ))}

                <Button type="submit" size="sm" variant={done ? 'secondary' : 'primary'} className="w-fit">
                  {done ? 'Update' : 'Save section'}
                </Button>
              </form>
            </CardContent>
          </Card>
        );
      })}

      <Link href="/today">
        <Button variant={allDone ? 'primary' : 'secondary'} className="w-full">
          {allDone ? 'All set — go to my dashboard' : 'Skip for now'}
        </Button>
      </Link>
    </div>
  );
}

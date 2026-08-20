import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ONBOARDING_STEPS, readAnswer } from '@/lib/onboarding';

/**
 * Coach-side read of a client's intake. Self-fetching so the client detail
 * page only has to drop it in. Shows partial answers rather than hiding
 * everything until the intake is finished — half an intake is still useful.
 */
export async function IntakeCard({ clientId }: { clientId: string }) {
  const responses = await prisma.onboardingResponse.findMany({ where: { clientId } });
  if (responses.length === 0) return null;

  type Saved = { answerJson: unknown; completedAt: Date | null };
  const byStep = new Map<string, Saved>(
    responses.map((r) => [r.stepKey, r as Saved])
  );
  const completed = ONBOARDING_STEPS.filter((s) => byStep.get(s.key)?.completedAt).length;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Intake</CardTitle>
        <span className="text-xs text-muted-foreground">
          {completed}/{ONBOARDING_STEPS.length} sections
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {ONBOARDING_STEPS.map((step) => {
          const answers = readAnswer(byStep.get(step.key)?.answerJson);
          const filled = step.fields.filter((f) => answers[f.key]);
          if (filled.length === 0) return null;

          return (
            <div key={step.key}>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {step.title}
              </p>
              <dl className="mt-2 flex flex-col gap-2">
                {filled.map((f) => (
                  <div key={f.key}>
                    <dt className="text-xs text-muted-foreground">{f.label}</dt>
                    <dd className="whitespace-pre-wrap text-sm">{answers[f.key]}</dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

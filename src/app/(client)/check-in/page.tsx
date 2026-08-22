import Link from 'next/link';
import { requireEntitledClient } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SystemWindow, SystemWindowContent, Count } from '@/components/ui/system-window';
import { Button } from '@/components/ui/button';
import { CHECK_IN_QUESTIONS, weekOf, formatWeek, readAnswers } from '@/lib/check-in';
import { submitCheckIn } from './actions';

export default async function CheckInPage({
  searchParams,
}: {
  searchParams: { saved?: string };
}) {
  const user = await requireEntitledClient();
  const week = weekOf();

  const [current, previous] = await Promise.all([
    prisma.checkIn.findFirst({ where: { clientId: user.id, weekOf: week } }),
    prisma.checkIn.findMany({
      where: { clientId: user.id, weekOf: { lt: week } },
      orderBy: { weekOf: 'desc' },
      take: 4,
    }),
  ]);

  const answers = readAnswers(current?.answersJson);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="readout text-[11px] uppercase text-muted-foreground">Weekly</p>
        <h1 className="display mt-1.5 text-2xl">Check-in</h1>
      </header>

      {searchParams.saved && (
        <p className="border border-accent/40 bg-accent/[0.07] px-4 py-3 text-sm">
          Sent to your coach. You can update it any time this week.
        </p>
      )}

      <SystemWindow title="Check-in" meta={formatWeek(week)}>
        <SystemWindowContent className="pt-4">
          <form action={submitCheckIn} className="flex flex-col gap-6">
            {CHECK_IN_QUESTIONS.map((q) => (
              <div key={q.key} className="flex flex-col gap-2">
                <label htmlFor={q.key} className="text-sm font-medium">
                  {q.label}
                </label>
                {q.hint && <p className="-mt-1 text-xs text-muted-foreground">{q.hint}</p>}

                {q.type === 'scale' ? (
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                      <label
                        key={n}
                        className="readout flex h-9 w-9 cursor-pointer items-center justify-center rounded-none border border-border bg-secondary/30 text-sm transition-colors hover:border-accent/50 has-[:checked]:border-accent has-[:checked]:bg-accent has-[:checked]:text-accent-foreground has-[:checked]:shadow-[0_0_14px_-2px_hsl(var(--accent)/0.7)]"
                      >
                        <input
                          type="radio"
                          name={q.key}
                          value={n}
                          defaultChecked={answers[q.key] === n}
                          className="sr-only"
                        />
                        {n}
                      </label>
                    ))}
                  </div>
                ) : (
                  <textarea
                    id={q.key}
                    name={q.key}
                    rows={3}
                    maxLength={2000}
                    defaultValue={typeof answers[q.key] === 'string' ? String(answers[q.key]) : ''}
                    className="w-full resize-none rounded-none border border-border bg-secondary/30 p-3 text-sm transition-colors placeholder:text-muted-foreground focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/50"
                  />
                )}
              </div>
            ))}

            <Button type="submit" className="w-fit">
              {current ? 'Update check-in' : 'Send to coach'}
            </Button>
          </form>
        </SystemWindowContent>
      </SystemWindow>

      {previous.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Past weeks</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {previous.map((c) => {
                const a = readAnswers(c.answersJson);
                return (
                  <li key={c.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="text-muted-foreground">{formatWeek(c.weekOf)}</span>
                    {typeof a.adherence === 'number' ? (
                      <span className="flex items-center gap-2">
                        <Count value={a.adherence} total={10} />
                        <span className="readout text-[10px] uppercase text-muted-foreground">
                          adherence
                        </span>
                      </span>
                    ) : (
                      <span className="readout text-[10px] uppercase text-muted-foreground">
                        Submitted
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      <Link href="/progress" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        Back to progress
      </Link>
    </div>
  );
}

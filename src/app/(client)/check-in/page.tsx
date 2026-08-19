import Link from 'next/link';
import { requireClient } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CHECK_IN_QUESTIONS, weekOf, formatWeek, readAnswers } from '@/lib/check-in';
import { submitCheckIn } from './actions';

export default async function CheckInPage({
  searchParams,
}: {
  searchParams: { saved?: string };
}) {
  const user = await requireClient();
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
        <h1 className="text-2xl font-semibold">Weekly check-in</h1>
        <p className="mt-1 text-sm text-muted-foreground">{formatWeek(week)}</p>
      </header>

      {searchParams.saved && (
        <p className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm">
          Sent to your coach. You can update it any time this week.
        </p>
      )}

      <Card>
        <CardContent className="pt-6">
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
                        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-border bg-secondary/30 text-sm transition-colors has-[:checked]:border-accent has-[:checked]:bg-accent has-[:checked]:text-accent-foreground"
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
                    className="w-full resize-none rounded-xl border border-border bg-secondary/30 p-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                )}
              </div>
            ))}

            <Button type="submit" className="w-fit">
              {current ? 'Update check-in' : 'Send to coach'}
            </Button>
          </form>
        </CardContent>
      </Card>

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
                    <span className="tabular-nums text-muted-foreground">
                      {typeof a.adherence === 'number' ? `${a.adherence}/10 adherence` : 'Submitted'}
                    </span>
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

import Link from 'next/link';
import { ClipboardList, ChevronRight, Trash2 } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { createTemplate, deleteTemplate } from './actions';

export default async function CoachProgramsPage() {
  const templates = await prisma.workoutTemplate.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { workouts: true, clientPrograms: true } },
    },
  });

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold">Programs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Build a workout template once and reuse it across clients, or create a one-off for a single
          client — either way it starts here.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>New Program</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createTemplate} className="flex flex-col gap-3 sm:flex-row">
            <Input name="name" placeholder="Program name (e.g. Push Pull Legs, or Jane's Custom Plan)" required className="flex-1" />
            <Input name="description" placeholder="Description (optional)" className="flex-1" />
            <Button type="submit" size="sm" className="w-fit shrink-0">
              Create & Build
            </Button>
          </form>
        </CardContent>
      </Card>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <ClipboardList size={22} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No programs yet — create your first one above.</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {templates.map((t) => (
            <li key={t.id}>
              <Card interactive>
                <CardContent className="flex items-center justify-between gap-4 pt-6">
                  <Link href={`/coach/programs/${t.id}`} className="flex flex-1 flex-col gap-2">
                    <p className="text-sm font-medium">{t.name}</p>
                    {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline">
                        {t._count.workouts} day{t._count.workouts === 1 ? '' : 's'}
                      </Badge>
                      <Badge variant={t._count.clientPrograms > 0 ? 'accent' : 'outline'}>
                        {t._count.clientPrograms > 0
                          ? `Assigned to ${t._count.clientPrograms}`
                          : 'Not assigned'}
                      </Badge>
                    </div>
                  </Link>
                  <div className="flex items-center gap-3">
                    <form action={deleteTemplate}>
                      <input type="hidden" name="id" value={t.id} />
                      <button
                        type="submit"
                        title="Delete program"
                        className="text-muted-foreground transition-colors hover:text-destructive"
                      >
                        <Trash2 size={16} />
                      </button>
                    </form>
                    <Link href={`/coach/programs/${t.id}`}>
                      <ChevronRight size={18} className="text-muted-foreground" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

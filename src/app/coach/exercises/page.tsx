import { Dumbbell, Trash2, Video } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { watchUrlFor } from '@/lib/exercise-video';
import { createExercise, deleteExercise, setExerciseVideo } from './actions';

const selectClass =
  'flex h-11 w-full rounded-xl border border-input bg-secondary/40 px-4 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const EQUIPMENT_OPTIONS = ['Barbell', 'Dumbbell', 'Cable', 'Machine', 'Bodyweight', 'Kettlebell', 'Band', 'Other'];
const DIFFICULTY_OPTIONS = ['Beginner', 'Intermediate', 'Advanced'];

export default async function CoachExercisesPage({
  searchParams,
}: {
  searchParams: { q?: string; muscle?: string; equipment?: string };
}) {
  const q = searchParams.q?.trim() ?? '';
  const muscle = searchParams.muscle ?? '';
  const equipment = searchParams.equipment ?? '';

  // The library is a few hundred deep, so it is filtered in the query rather
  // than rendered whole and scrolled through.
  const exercises = await prisma.exercise.findMany({
    where: {
      ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
      ...(muscle ? { musclePrimary: muscle } : {}),
      ...(equipment ? { equipment } : {}),
    },
    orderBy: [{ musclePrimary: 'asc' }, { name: 'asc' }],
    take: 200,
    include: { video: true },
  });

  const [allMuscles, allEquipment, total] = await Promise.all([
    prisma.exercise.findMany({
      distinct: ['musclePrimary'],
      select: { musclePrimary: true },
      orderBy: { musclePrimary: 'asc' },
    }),
    prisma.exercise.findMany({
      distinct: ['equipment'],
      select: { equipment: true },
      orderBy: { equipment: 'asc' },
    }),
    prisma.exercise.count(),
  ]);

  const filtering = Boolean(q || muscle || equipment);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold">Exercise Library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {total} exercises. Every one of them is available when you build a workout template.
        </p>
      </header>

      <Card>
        <CardContent className="pt-6">
          {/* Plain GET form — filtering works with no JS and the URL stays shareable. */}
          <form className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Input
              name="q"
              placeholder="Search exercises…"
              defaultValue={q}
              className="sm:col-span-2"
            />
            <select name="muscle" className={selectClass} defaultValue={muscle}>
              <option value="">All muscles</option>
              {allMuscles.map((m) => (
                <option key={m.musclePrimary} value={m.musclePrimary}>
                  {m.musclePrimary}
                </option>
              ))}
            </select>
            <select name="equipment" className={selectClass} defaultValue={equipment}>
              <option value="">All equipment</option>
              {allEquipment.map((e) => (
                <option key={e.equipment} value={e.equipment}>
                  {e.equipment}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-3 sm:col-span-4">
              <Button type="submit" size="sm">
                Filter
              </Button>
              {filtering && (
                <a
                  href="/coach/exercises"
                  className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                >
                  Clear
                </a>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                Showing {exercises.length}
                {exercises.length === 200 ? '+ (narrow your search)' : ''}
              </span>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add Exercise</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createExercise} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input name="name" placeholder="Exercise name" required className="sm:col-span-2" />
            <Input name="musclePrimary" placeholder="Primary muscle (e.g. Chest)" required />
            <select name="equipment" className={selectClass} required defaultValue="">
              <option value="" disabled>
                Equipment…
              </option>
              {EQUIPMENT_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            <select name="difficulty" className={selectClass} required defaultValue="">
              <option value="" disabled>
                Difficulty…
              </option>
              {DIFFICULTY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            <Input name="muscleSecondary" placeholder="Secondary muscles, comma separated" />
            <Input name="movementPattern" placeholder="Movement pattern (e.g. Push)" className="sm:col-span-2" />
            <textarea
              name="instructions"
              rows={2}
              placeholder="Instructions"
              className="w-full resize-none rounded-xl border border-border bg-secondary/30 p-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:col-span-2"
            />
            <textarea
              name="cues"
              rows={2}
              placeholder="Coaching cues"
              className="w-full resize-none rounded-xl border border-border bg-secondary/30 p-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:col-span-2"
            />
            <Input name="tags" placeholder="Tags, comma separated" className="sm:col-span-2" />
            <Button type="submit" size="sm" className="w-fit sm:col-span-2">
              Add Exercise
            </Button>
          </form>
        </CardContent>
      </Card>

      {exercises.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Dumbbell size={22} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {filtering
                ? 'Nothing matches those filters.'
                : 'No exercises yet — add your first one above.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {exercises.map((ex) => {
            const videoUrl = ex.video
              ? watchUrlFor(ex.video.storageProvider, ex.video.externalId)
              : null;
            return (
            <li key={ex.id}>
              <Card>
                <CardContent className="flex items-start justify-between gap-4 pt-6">
                  <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium">{ex.name}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="accent">{ex.musclePrimary}</Badge>
                      <Badge variant="outline">{ex.equipment}</Badge>
                      <Badge variant="outline">{ex.difficulty}</Badge>
                      {ex.muscleSecondary.map((m) => (
                        <Badge key={m} variant="default">
                          {m}
                        </Badge>
                      ))}
                    </div>
                    {ex.instructions && (
                      <p className="text-xs text-muted-foreground">{ex.instructions}</p>
                    )}

                    {/* One demo link per exercise. Paste a YouTube, Vimeo or
                        direct video URL; submitting it empty clears it. */}
                    <form action={setExerciseVideo} className="mt-1 flex items-center gap-2">
                      <input type="hidden" name="exerciseId" value={ex.id} />
                      <Video size={14} className={videoUrl ? 'text-accent' : 'text-muted-foreground'} />
                      <input
                        name="videoUrl"
                        defaultValue={videoUrl ?? ''}
                        placeholder="Demo video URL"
                        className="readout h-8 w-full max-w-xs rounded-none border border-input bg-secondary/40 px-2 text-[11px] focus-visible:border-accent/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
                      />
                      <Button type="submit" variant="ghost" size="sm">
                        Save
                      </Button>
                      {videoUrl && (
                        <a
                          href={videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="readout shrink-0 text-[10px] uppercase text-accent hover:underline"
                        >
                          Watch
                        </a>
                      )}
                    </form>
                  </div>
                  <form action={deleteExercise}>
                    <input type="hidden" name="id" value={ex.id} />
                    <button
                      type="submit"
                      title="Delete exercise"
                      className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <Trash2 size={16} />
                    </button>
                  </form>
                </CardContent>
              </Card>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

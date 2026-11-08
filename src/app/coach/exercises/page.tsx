import { Dumbbell, Trash2, Video } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { watchUrlFor } from '@/lib/exercise-video';
import { createExercise, deleteExercise, loadExerciseMedia, setExerciseVideo } from './actions';

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

  // Every movement a client is asked to do should come with a demonstration.
  // Counting what is still missing turns "add videos eventually" into a
  // number that goes down.
  const [missingVideos, withPhotos] = await Promise.all([
    prisma.exercise.count({ where: { videoId: null } }),
    prisma.exercise.count({ where: { NOT: { imageUrls: { isEmpty: true } } } }),
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

      {/* Photos and steps. Clients see the start and finish photos plus the
          steps on every movement that has them; movements without a pasted
          video still get a "Find a demo" YouTube search, so nobody is left
          guessing what a movement looks like. */}
      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-base font-semibold text-foreground">
              {withPhotos} of {total} movements have photos and how-to steps
            </p>
            <p className="text-sm text-foreground/75">
              Every movement also gets a demo button for clients. Paste your own video on any row
              below to replace the YouTube search with your exact demo ({total - missingVideos} so far).
            </p>
          </div>
          <form action={loadExerciseMedia}>
            <Button type="submit" size="sm" className="shrink-0">
              Add photos &amp; steps
            </Button>
          </form>
        </CardContent>
      </Card>

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
        <details>
        <summary className="cursor-pointer list-none px-6 py-4 text-sm font-semibold text-foreground hover:text-accent">
          + Add your own exercise
        </summary>
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
        </details>
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
                  {ex.imageUrls[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={ex.imageUrls[0]}
                      alt=""
                      loading="lazy"
                      className="hidden h-20 w-28 shrink-0 rounded-lg object-cover sm:block"
                    />
                  ) : null}
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <p className="text-base font-semibold text-foreground">{ex.name}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="accent">{ex.musclePrimary}</Badge>
                      <Badge variant="outline">{ex.equipment}</Badge>
                      <Badge variant="outline">{ex.difficulty}</Badge>
                      {!videoUrl && <Badge variant="outline">No video yet</Badge>}
                      {ex.muscleSecondary.map((m) => (
                        <Badge key={m} variant="default">
                          {m}
                        </Badge>
                      ))}
                    </div>
                    {ex.instructions && (
                      <details className="text-sm text-foreground/80">
                        <summary className="cursor-pointer text-xs font-medium text-accent">How to do it</summary>
                        <p className="mt-1 whitespace-pre-line leading-relaxed">{ex.instructions}</p>
                      </details>
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

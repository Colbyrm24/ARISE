import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readPrescription,
  cleanPrescription,
  buildSets,
  planSetChanges,
  prescriptionText,
  restBetweenText,
  restBlockText,
  durationText,
  normalizeGroups,
  moveRow,
  groupAsSuperset,
  ungroup,
  groupBlocks,
  setWorkSeconds,
  secondsPerRep,
  estimateMinutes,
  equipmentFor,
  thumbnailFor,
  filterLibrary,
  parseRestSeconds,
  parseEstMinutes,
  type OrderRow,
  type EstimateRow,
} from '../workout-builder';

/*
  What is pinned down here: the builder's one-line prescription reads the way
  Colby writes his programming, a superset is always a run of adjacent rows
  (never a box around one exercise, never two boxes with the same letter), and
  lowering a set count can never delete a set a client has logged.
*/

const ids = () => {
  let n = 0;
  return () => `g${++n}`;
};

const rows = (spec: string): OrderRow[] =>
  // "a b:x c:x d" -> a, b in group x, c in group x, d
  spec.split(' ').map((t) => {
    const [id, g] = t.split(':');
    return { id: id!, supersetGroup: g ?? null };
  });

const shape = (rs: OrderRow[]) => rs.map((r) => (r.supersetGroup ? `${r.id}:${r.supersetGroup}` : r.id)).join(' ');

test('the prescription line reads like his programming', () => {
  assert.equal(
    prescriptionText({ warmup: 0, working: 3, drop: 1, reps: '8-10', weight: null }),
    '3 sets x 8–10 reps + drop set'
  );
  assert.equal(prescriptionText({ warmup: 0, working: 1, drop: 0, reps: '12', weight: null }), '1 set x 12 reps');
  assert.equal(
    prescriptionText({ warmup: 1, working: 2, drop: 2, reps: 'to failure', weight: 135 }),
    '1 warm-up + 2 sets x to failure @ 135 lb + 2 drop sets'
  );
  assert.equal(prescriptionText({ warmup: 0, working: 4, drop: 0, reps: null, weight: null }), '4 sets');
});

test('rest reads in the units a person counts in', () => {
  assert.equal(durationText(90), '90s');
  assert.equal(durationText(60), '1 min');
  assert.equal(durationText(120), '2 min');
  assert.equal(durationText(150), '2 min 30s');
  assert.equal(restBetweenText(120), 'Rest 2 min between sets');
  assert.equal(restBetweenText(null), null);
  assert.equal(restBetweenText(0), null);
  assert.equal(restBlockText(180), 'Rest 3 min');
});

test('stored sets read back as one prescription', () => {
  const p = readPrescription([
    { type: 'warmup', targetReps: '12', targetWeight: null, restSeconds: 60, tempo: null },
    { type: 'working', targetReps: '8-10', targetWeight: 100, restSeconds: 120, tempo: '3010' },
    { type: 'working', targetReps: '8-10', targetWeight: 100, restSeconds: 120, tempo: '3010' },
    { type: 'drop', targetReps: '8-10', targetWeight: 100, restSeconds: 120, tempo: '3010' },
  ]);
  assert.deepEqual(p, { warmup: 1, working: 2, drop: 1, reps: '8-10', weight: 100, restSeconds: 120, tempo: '3010' });
});

test('a prescription becomes rows in the order they are done', () => {
  const sets = buildSets({ warmup: 1, working: 2, drop: 1, reps: '10', weight: 50, restSeconds: 90, tempo: null });
  assert.deepEqual(
    sets.map((s) => [s.setNumber, s.type, s.targetWeight]),
    [
      [1, 'warmup', null],
      [2, 'working', 50],
      [3, 'working', 50],
      [4, 'drop', 50],
    ]
  );
});

test('anything from the browser is clamped before it is written', () => {
  const p = cleanPrescription({ working: 30, warmup: 5, drop: 5, reps: '  ', weight: 99999, restSeconds: 1e9 });
  assert.equal(p.working, 10);
  assert.equal(p.warmup, 0);
  assert.equal(p.drop, 0);
  assert.equal(p.reps, null);
  assert.equal(p.weight, null);
  assert.equal(p.restSeconds, 3600);
  const q = cleanPrescription({ working: 'abc', warmup: -2, drop: 1, reps: '8-10', weight: '22.555', tempo: '3-1-1-0' });
  assert.equal(q.working, 3);
  assert.equal(q.warmup, 0);
  assert.equal(q.drop, 1);
  assert.equal(q.weight, 22.56);
  assert.equal(q.tempo, '3-1-1-0');
  assert.ok(q.working + q.warmup + q.drop <= 10);
});

test('number boxes: blank means automatic, junk means nothing', () => {
  assert.equal(parseRestSeconds(''), null);
  assert.equal(parseRestSeconds('90'), 90);
  assert.equal(parseRestSeconds(-5), null);
  assert.equal(parseEstMinutes(''), null);
  assert.equal(parseEstMinutes('45'), 45);
  assert.equal(parseEstMinutes('NaN'), null);
});

test('set rows keep their ids by position so logged history stays attached', () => {
  const existing = [
    { id: 's1', setNumber: 1, hasLogs: true },
    { id: 's2', setNumber: 2, hasLogs: false },
    { id: 's3', setNumber: 3, hasLogs: false },
  ];
  const up = planSetChanges(existing, buildSets({ ...cleanPrescription({ working: 4 }) }));
  assert.ok(up.ok);
  if (up.ok) {
    assert.deepEqual(up.updates.map((u) => u.id), ['s1', 's2', 's3']);
    assert.equal(up.creates.length, 1);
    assert.deepEqual(up.deletes, []);
  }
  const down = planSetChanges(existing, buildSets(cleanPrescription({ working: 1 })));
  assert.ok(down.ok);
  if (down.ok) assert.deepEqual(down.deletes, ['s2', 's3']);
});

test('a logged set cannot be removed by lowering the count', () => {
  const plan = planSetChanges(
    [
      { id: 's1', setNumber: 1, hasLogs: false },
      { id: 's2', setNumber: 2, hasLogs: true },
      { id: 's3', setNumber: 3, hasLogs: false },
    ],
    buildSets(cleanPrescription({ working: 1 }))
  );
  assert.equal(plan.ok, false);
  if (!plan.ok) assert.match(plan.reason, /at least 2 sets/);
});

test('a superset is a run of adjacent rows, never one row, never split', () => {
  const id = ids();
  assert.equal(shape(normalizeGroups(rows('a:x b c:y'), id)), 'a b c');
  assert.equal(shape(normalizeGroups(rows('a:x b:x c d:x e:x'), ids())), 'a:x b:x c d:g1 e:g1');
  assert.equal(shape(normalizeGroups(rows('a:x b:x c:y d:y'), ids())), 'a:x b:x c:y d:y');
});

test('grouping gathers the chosen rows at the first one', () => {
  const out = groupAsSuperset(rows('a b c d'), ['b', 'd'], ids());
  assert.equal(shape(out), 'a b:g1 d:g1 c');
  // One row is not a superset.
  assert.equal(shape(groupAsSuperset(rows('a b'), ['a'], ids())), 'a b');
  // Regrouping a member pulls it out of its old superset, which then falls apart.
  assert.equal(shape(groupAsSuperset(rows('a:x b:x c'), ['b', 'c'], ids())), 'a b:g1 c:g1');
});

test('ungrouping the middle of a superset leaves two honest ones or none', () => {
  assert.equal(shape(ungroup(rows('a:x b:x c:x'), ['b'], ids())), 'a b c');
  assert.equal(shape(ungroup(rows('a:x b:x c:x d:x e:x'), ['c'], ids())), 'a:x b:x c d:g1 e:g1');
});

test('dragging a row moves it, and dropping inside a superset joins it', () => {
  assert.equal(shape(moveRow(rows('a b c'), 'c', 'a', ids())), 'c a b');
  assert.equal(shape(moveRow(rows('a b c'), 'a', null, ids())), 'b c a');
  assert.equal(shape(moveRow(rows('a:x b:x c'), 'c', 'b', ids())), 'a:x c:x b:x');
  // Dragged out of a two-member superset: both are single again.
  assert.equal(shape(moveRow(rows('a:x b:x c'), 'a', null, ids())), 'b c a');
  // Dropped before the first member is above the superset, not in it.
  assert.equal(shape(moveRow(rows('a:x b:x c'), 'c', 'a', ids())), 'c a:x b:x');
});

test('blocks label supersets A1, A2 and leave single movements alone', () => {
  const blocks = groupBlocks(rows('a b:x c:x d e:y f:y'));
  assert.deepEqual(
    blocks.map((b) => [b.superset, b.letter, b.rows.map((r) => r.label ?? r.row.id).join(',')]),
    [
      [false, null, 'a'],
      [true, 'A', 'A1,A2'],
      [false, null, 'd'],
      [true, 'B', 'B1,B2'],
    ]
  );
});

test('a set takes its reps times its tempo', () => {
  assert.equal(secondsPerRep(null), 3);
  assert.equal(secondsPerRep('3-1-1-0'), 5);
  assert.equal(secondsPerRep('31X0'), 5);
  assert.equal(secondsPerRep('slow'), 3);
  assert.equal(setWorkSeconds('8-10', null), 27);
  assert.equal(setWorkSeconds('12', '2-0-2-0'), 48);
  assert.equal(setWorkSeconds('45s', null), 45);
  assert.equal(setWorkSeconds('2 min', null), 120);
  assert.equal(setWorkSeconds('to failure', null), 36);
});

const est = (id: string, sets: number, rest: number | null, group: string | null = null, after: number | null = null): EstimateRow => ({
  id,
  supersetGroup: group,
  restAfterSeconds: after,
  sets: Array.from({ length: sets }, () => ({ targetReps: '10', restSeconds: rest, tempo: null })),
});

test('estimated minutes add up work, rest, set-up and rest blocks', () => {
  assert.equal(estimateMinutes([]), 0);
  // 3 sets x (30s work + 90s rest) + 30s set-up = 390s -> 7 min
  assert.equal(estimateMinutes([est('a', 3, 90)]), 7);
  // A 3-minute rest block adds 3 minutes.
  assert.equal(estimateMinutes([est('a', 3, 90, null, 180)]), 10);
});

test('a superset does not charge rest between its members', () => {
  const straight = estimateMinutes([est('a', 3, 90), est('b', 3, 90)]);
  const superset = estimateMinutes([est('a', 3, 90, 'x'), est('b', 3, 90, 'x')]);
  assert.ok(superset < straight, `${superset} should be under ${straight}`);
  // a: 30 + 3*30 = 120; b: 30 + 3*(30+90) = 390 -> 510s = 9 min (rounded from 8.5)
  assert.equal(superset, 9);
});

test('equipment chips are the distinct kit, without bodyweight', () => {
  assert.deepEqual(
    equipmentFor([{ equipment: 'Barbell' }, { equipment: 'bodyweight' }, { equipment: 'barbell' }, { equipment: 'Cable' }, { equipment: '' }]),
    ['Barbell', 'Cable']
  );
});

test('thumbnails come only from what is stored', () => {
  assert.equal(
    thumbnailFor({ videoUrl: 'https://youtu.be/dQw4w9WgXcQ', video: null }),
    'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
  );
  assert.equal(thumbnailFor({ videoUrl: 'https://vimeo.com/123456789', video: { thumbnailUrl: 'https://x/t.jpg' } }), 'https://x/t.jpg');
  assert.equal(thumbnailFor({ videoUrl: null, video: null }), null);
  assert.equal(thumbnailFor({ videoUrl: 'javascript:alert(1)', video: null }), null);
});

test('the library filters as you type, every word must match', () => {
  const lib = [
    { id: '1', name: 'Incline DB Press', musclePrimary: 'Chest', equipment: 'Dumbbell', thumb: null },
    { id: '2', name: 'Barbell Row', musclePrimary: 'Back', equipment: 'Barbell', thumb: null },
    { id: '3', name: 'Cable Fly', musclePrimary: 'Chest', equipment: 'Cable', thumb: null },
  ];
  assert.deepEqual(filterLibrary(lib, { q: 'db inc' }).map((e) => e.id), ['1']);
  assert.deepEqual(filterLibrary(lib, { muscle: 'Chest' }).map((e) => e.id), ['3', '1']);
  assert.deepEqual(filterLibrary(lib, { equipment: 'Barbell' }).map((e) => e.id), ['2']);
  assert.deepEqual(filterLibrary(lib, { q: 'chest', sort: 'muscle' }).map((e) => e.id), ['3', '1']);
  assert.deepEqual(filterLibrary(lib, {}).map((e) => e.id), ['2', '3', '1']);
});

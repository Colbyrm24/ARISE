/*
  Ranking people against each other, which is the part you cannot be casual
  about. Every case below is a way the board could quietly insult somebody:
  telling two people on identical numbers that one is behind the other,
  reshuffling positions when nothing happened, or printing a surname on a
  screen every one of a coach's clients can read.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  boardView,
  consistencyPercent,
  rankBoard,
  type BoardRow,
} from '@/lib/leaderboard';

const row = (clientId: string, fullName: string | null, activeDays: number): BoardRow => ({
  clientId,
  fullName,
  activeDays,
});

test('consistency is days active over days possible', () => {
  assert.equal(consistencyPercent(30, 30), 100);
  assert.equal(consistencyPercent(15, 30), 50);
  assert.equal(consistencyPercent(0, 30), 0);
  assert.equal(consistencyPercent(28, 30), 93);
});

test('a score over the window is capped, not printed', () => {
  // A client ahead of the server can log a day the window hasn't started.
  assert.equal(consistencyPercent(31, 30), 100);
  assert.equal(consistencyPercent(5, 0), 0);
});

test('the board is ordered by consistency alone', () => {
  const board = rankBoard([row('a', 'Ann A', 12), row('b', 'Ben B', 30), row('c', 'Cal C', 21)], 30);
  assert.deepEqual(
    board.map((e) => [e.rank, e.name]),
    [
      [1, 'Ben'],
      [2, 'Cal'],
      [3, 'Ann'],
    ]
  );
});

test('ties share a rank and the next rank skips', () => {
  // Three people level on 28 are all 2nd. Telling one of them they are 4th
  // when they did identical work is the fastest way to lose them.
  const board = rankBoard(
    [
      row('w', 'Zoe Z', 30),
      row('x', 'Ann A', 28),
      row('y', 'Ben B', 28),
      row('z', 'Cal C', 28),
      row('q', 'Dan D', 10),
    ],
    30
  );
  assert.deepEqual(
    board.map((e) => [e.rank, e.name]),
    [
      [1, 'Zoe'],
      [2, 'Ann'],
      [2, 'Ben'],
      [2, 'Cal'],
      [5, 'Dan'],
    ]
  );
});

test('tied people are ordered by name so the board never reshuffles', () => {
  const rows = [row('b', 'Ben B', 20), row('a', 'Ann A', 20)];
  const once = rankBoard(rows, 30).map((e) => e.name);
  const again = rankBoard([...rows].reverse(), 30).map((e) => e.name);
  assert.deepEqual(once, ['Ann', 'Ben']);
  assert.deepEqual(again, ['Ann', 'Ben']);
});

test('only a first name ever reaches the board', () => {
  // Every client of one coach can read this screen.
  const [entry] = rankBoard([row('a', 'Colby Mullins', 30)], 30);
  assert.equal(entry.name, 'Colby');
  assert.equal(JSON.stringify(entry).includes('Mullins'), false);
});

test('a client with no name on file is not exposed by id', () => {
  const [entry] = rankBoard([row('a', null, 5)], 30);
  assert.equal(entry.name, 'A client');
});

test('the viewer is marked, and only the viewer', () => {
  const board = rankBoard([row('a', 'Ann A', 30), row('b', 'Ben B', 20)], 30, 'b');
  assert.deepEqual(board.map((e) => e.isViewer), [false, true]);
});

// --- what actually gets drawn
test('a viewer outside the top is carried down to the bottom of the board', () => {
  const rows = Array.from({ length: 20 }, (_, i) =>
    row(`c${i}`, `Name${String(i).padStart(2, '0')} X`, 30 - i)
  );
  const view = boardView(rankBoard(rows, 30, 'c15'), 10);
  assert.equal(view.head.length, 10);
  assert.equal(view.trailing?.clientId, 'c15');
  assert.equal(view.trailing?.rank, 16);
});

test('a viewer already in the top is not shown twice', () => {
  const rows = Array.from({ length: 20 }, (_, i) =>
    row(`c${i}`, `Name${String(i).padStart(2, '0')} X`, 30 - i)
  );
  const view = boardView(rankBoard(rows, 30, 'c2'), 10);
  assert.equal(view.trailing, null);
});

test('a coach with fewer clients than the cap shows everyone', () => {
  const view = boardView(rankBoard([row('a', 'Ann A', 30), row('b', 'Ben B', 10)], 30, 'b'), 10);
  assert.equal(view.head.length, 2);
  assert.equal(view.trailing, null);
});

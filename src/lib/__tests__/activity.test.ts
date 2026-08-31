/*
  The lines the coach reads in the feed.

  Every case here came from a way the feed could look broken: a full name in
  a list of first names, a 14-hour "session" from a workout somebody forgot
  to close, and a protein goal announcing itself again on every meal after
  the one that hit it.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cardioLoggedBody,
  crossedProtein,
  firstName,
  proteinHitBody,
  workoutFinishedBody,
} from '@/lib/activity';

test('a feed uses first names', () => {
  assert.equal(firstName('Colby Mullins'), 'Colby');
  assert.equal(firstName('  Mathew  '), 'Mathew');
  assert.equal(firstName(''), 'A client');
  assert.equal(firstName(null), 'A client');
  assert.equal(firstName(undefined), 'A client');
});

test('a finished workout names the session', () => {
  assert.equal(
    workoutFinishedBody('Colby Mullins', 'Upper (Chest Focused)', 35 * 60),
    'Colby finished Upper (Chest Focused) · 35 min'
  );
});

test('an untitled workout still reads as a sentence', () => {
  assert.equal(workoutFinishedBody('Mathew', null, 40 * 60), 'Mathew finished their workout · 40 min');
  assert.equal(workoutFinishedBody('Mathew', '   ', 40 * 60), 'Mathew finished their workout · 40 min');
});

test('an unbelievable duration is dropped, not printed', () => {
  // Opened the workout, walked away, tapped finish the next morning.
  assert.equal(workoutFinishedBody('Mathew', 'Legs + Abs', 14 * 3600), 'Mathew finished Legs + Abs');
  // And the other end: a mis-tap two minutes after opening it.
  assert.equal(workoutFinishedBody('Mathew', 'Legs + Abs', 120), 'Mathew finished Legs + Abs');
  assert.equal(workoutFinishedBody('Mathew', 'Legs + Abs', null), 'Mathew finished Legs + Abs');
});

test('the boundaries of a believable session are kept', () => {
  assert.match(workoutFinishedBody('M', 'X', 5 * 60), /5 min$/);
  assert.match(workoutFinishedBody('M', 'X', 180 * 60), /180 min$/);
  assert.equal(workoutFinishedBody('M', 'X', 181 * 60), 'M finished X');
});

test('cardio says what and how long', () => {
  assert.equal(
    cardioLoggedBody('Colby Mullins', 'Incline Treadmill', 30),
    'Colby logged 30 min of incline treadmill'
  );
  assert.equal(cardioLoggedBody('Colby', null, 20), 'Colby logged 20 min of cardio');
});

test('protein reports the number it landed on', () => {
  assert.equal(
    proteinHitBody('Mathew Smith', 186.4, 180),
    'Mathew hit their protein goal · 186g of 180g'
  );
});

// --- the crossing, which is what stops the feed repeating itself
test('crossing the goal is a one-time event', () => {
  assert.equal(crossedProtein(150, 185, 180), true);
  // The next meal that day. Already over, so nothing new happened.
  assert.equal(crossedProtein(185, 220, 180), false);
});

test('landing exactly on the target counts', () => {
  assert.equal(crossedProtein(150, 180, 180), true);
});

test('not getting there is not a crossing', () => {
  assert.equal(crossedProtein(20, 150, 180), false);
});

test('no goal means nothing to cross', () => {
  assert.equal(crossedProtein(0, 300, undefined), false);
  assert.equal(crossedProtein(0, 300, 0), false);
});

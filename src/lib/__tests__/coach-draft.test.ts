import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, describeDay, tidyDraft, MAX_DRAFT } from '../coach-draft';
import type { DayContext } from '../day-shape';

const day: DayContext = {
  calories: 1450,
  protein: 150,
  carbs: 120,
  fat: 45,
  meals: 3,
  target: { calories: 2000, protein: 180, carbs: 200, fat: 60 },
  left: { calories: 550, protein: 30, fat: 15 },
  flag: null,
};

test('a paragraph gap becomes one continuous block', () => {
  const out = tidyDraft('About 480 calories 62g protein.\n\nHows the knee today?');
  assert.equal(out, 'About 480 calories 62g protein. Hows the knee today?');
  assert.ok(!out.includes('\n'));
});

test('a wrapping quote and a model preamble are stripped', () => {
  assert.equal(tidyDraft('"Perfecttt lets go my man!!"'), 'Perfecttt lets go my man!!');
  assert.equal(
    tidyDraft("Here's the message:\nGet after it brotha!!"),
    'Get after it brotha!!'
  );
});

test('an overlong draft loses middle sentences but keeps the closing question', () => {
  const first = 'About 1,450 calories 150g protein on the day.';
  const filler = 'That is a solid number and the protein is exactly where we want it right now.';
  const question = 'Hows the body feeling today?';
  const long = [first, filler, filler, filler, filler, filler, question].join(' ');
  assert.ok(long.length > MAX_DRAFT);

  const out = tidyDraft(long);
  assert.ok(out.length <= MAX_DRAFT, `expected <= ${MAX_DRAFT}, got ${out.length}`);
  // The number he leads with and the question he closes on both survive.
  assert.ok(out.startsWith(first));
  assert.ok(out.endsWith(question));
});

test('a draft already inside the ceiling is left exactly as written', () => {
  const text = 'Perfecttt thats what I like to hear my man. Whats dinner looking like?';
  assert.equal(tidyDraft(text), text);
});

test('a single overlong sentence is not cut mid-word', () => {
  const one = 'a'.repeat(MAX_DRAFT + 50);
  // Better a long message he can edit than one that looks broken.
  assert.equal(tidyDraft(one), one);
});

test('the day line carries totals, target, and what is left', () => {
  const line = describeDay(day);
  assert.ok(line);
  assert.match(line, /1,450 calories/);
  assert.match(line, /150g protein/);
  assert.match(line, /2,000 calories/);
  assert.match(line, /550 calories/);
});

test('a day with nothing logged produces no line at all', () => {
  assert.equal(describeDay(null), null);
  assert.equal(describeDay({ ...day, meals: 0 }), null);
});

test('a day with no targets set still describes what was eaten', () => {
  const line = describeDay({ ...day, target: null, left: null });
  assert.ok(line);
  assert.match(line, /1,450 calories/);
  assert.ok(!line.includes('target'));
});

test('the prompt carries the thread in order and names the client', () => {
  const prompt = buildPrompt({
    clientFirstName: 'Marcus',
    status: 'active',
    thread: [
      { from: 'coach', body: 'Hows today going?' },
      { from: 'client', body: 'Knee is bugging me again' },
    ],
    day,
  });

  assert.match(prompt, /Client: Marcus \(status: active\)/);
  assert.ok(prompt.indexOf('Colby: Hows today going?') < prompt.indexOf('Marcus: Knee is bugging me again'));
  assert.match(prompt, /Write Colbys next message/);
});

test('an empty thread asks for an opener rather than a reply', () => {
  const prompt = buildPrompt({ clientFirstName: 'Sam', status: null, thread: [], day: null });
  assert.match(prompt, /no conversation yet/i);
  assert.ok(!prompt.includes('Write Colbys next message'));
});

test('only the tail of a long thread is sent', () => {
  const thread = Array.from({ length: 40 }, (_, i) => ({
    from: (i % 2 === 0 ? 'coach' : 'client') as 'coach' | 'client',
    body: `message ${i}`,
  }));
  const prompt = buildPrompt({ clientFirstName: 'Sam', status: null, thread, day: null });

  assert.ok(prompt.includes('message 39'));
  assert.ok(!prompt.includes('message 0\n'));
});

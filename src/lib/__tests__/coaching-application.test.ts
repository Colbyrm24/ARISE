/*
  The coaching application: what an applicant can type, and what the server
  will store. The normalizers decide whether the coach's tel: and instagram
  links work at all, so they're pinned down here.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isCallReady,
  checkAnswer,
  formatPhone,
  isApplicationStatus,
  normalizeInstagram,
  normalizePhone,
  normalizeSource,
} from '@/lib/application-fields';
import { applicationSchema, isBot, isRecentDuplicate, DUPLICATE_WINDOW_MS } from '@/lib/application-schema';

test('instagram handles come out bare and lowercase from anything people paste', () => {
  assert.equal(normalizeInstagram('@ColbyMullins'), 'colbymullins');
  assert.equal(normalizeInstagram('colby.mullins_'), 'colby.mullins_');
  assert.equal(normalizeInstagram('https://www.instagram.com/colby/?igsh=abc'), 'colby');
  assert.equal(normalizeInstagram('instagram.com/colby/'), 'colby');
  assert.equal(normalizeInstagram('   '), '');
});

test('things that cannot be a handle are rejected, not stored', () => {
  assert.equal(normalizeInstagram('colby mullins'), null);
  assert.equal(normalizeInstagram('.colby'), null);
  assert.equal(normalizeInstagram('a'.repeat(31)), null);
  assert.equal(normalizeInstagram('colby!'), null);
});

test('US numbers in any format become +1 and anything with a + keeps its country', () => {
  assert.equal(normalizePhone('(555) 123-4567'), '+15551234567');
  assert.equal(normalizePhone('555.123.4567'), '+15551234567');
  assert.equal(normalizePhone('1 555 123 4567'), '+15551234567');
  assert.equal(normalizePhone('+44 7700 900123'), '+447700900123');
  assert.equal(normalizePhone(''), '');
  assert.equal(normalizePhone('12345'), null);
  assert.equal(normalizePhone('call me'), null);
  assert.equal(formatPhone('+15551234567'), '(555) 123-4567');
  assert.equal(formatPhone('+447700900123'), '+447700900123');
});

test('the ref tag is reduced to something safe to store', () => {
  assert.equal(normalizeSource('IG'), 'ig');
  assert.equal(normalizeSource('<script>'), 'script');
  assert.equal(normalizeSource(''), null);
  assert.equal(normalizeSource(undefined), null);
});

test('each screen of the form checks its own answer', () => {
  assert.ok(checkAnswer('firstName', ' '));
  assert.equal(checkAnswer('firstName', 'Colby'), null);
  assert.ok(checkAnswer('email', 'colby@'));
  assert.equal(checkAnswer('email', 'Colby@Example.com'), null);
  // Phone is required now: blank and wrong are both refused.
  assert.ok(checkAnswer('phone', ''));
  assert.ok(checkAnswer('phone', '123'));
  assert.equal(checkAnswer('phone', '555 123 4567'), null);
  assert.ok(checkAnswer('ageRange', 'thirty'));
  assert.equal(checkAnswer('ageRange', '25_34'), null);
  // The old "need to know more" answer is no longer offered.
  assert.ok(checkAnswer('investReady', 'more_info'));
  assert.equal(checkAnswer('monthlyIncome', '5k_10k'), null);
  assert.ok(checkAnswer('monthlyIncome', 'lots'));
});

const valid = {
  firstName: '  Jordan ',
  email: ' Jordan@Example.COM ',
  phone: '(555) 123-4567',
  ageRange: '35_44',
  goal: 'Lose 25 lbs and stop hiding in photos.',
  obstacle: 'Travel for work.',
  experience: 'on_off',
  monthlyIncome: '5k_10k',
  investReady: 'yes',
  source: 'IG',
  company: '',
};

test('a valid application is normalized on the way in', () => {
  const r = applicationSchema.safeParse(valid);
  assert.ok(r.success);
  assert.equal(r.data.firstName, 'Jordan');
  assert.equal(r.data.email, 'jordan@example.com');
  assert.equal(r.data.phone, '+15551234567');
  assert.equal(r.data.source, 'ig');
});

test('every question is required, phone and income included', () => {
  assert.equal(applicationSchema.safeParse({ ...valid, phone: '' }).success, false);
  assert.equal(applicationSchema.safeParse({ ...valid, phone: undefined }).success, false);
  assert.equal(applicationSchema.safeParse({ ...valid, monthlyIncome: undefined }).success, false);
});

test('only $3,000+ a month and a yes to investing goes straight to the calendar', () => {
  assert.equal(isCallReady({ monthlyIncome: '3k_5k', investReady: 'yes' }), true);
  assert.equal(isCallReady({ monthlyIncome: '10k_plus', investReady: 'yes' }), true);
  assert.equal(isCallReady({ monthlyIncome: 'under_3k', investReady: 'yes' }), false);
  assert.equal(isCallReady({ monthlyIncome: '10k_plus', investReady: 'no' }), false);
  assert.equal(isCallReady({ monthlyIncome: null, investReady: 'yes' }), false);
  assert.equal(isCallReady({ monthlyIncome: 'made_up', investReady: 'yes' }), false);
});

test('invalid answers are refused by the server even if the form was skipped', () => {
  assert.equal(applicationSchema.safeParse({ ...valid, email: 'nope' }).success, false);
  assert.equal(applicationSchema.safeParse({ ...valid, phone: '12' }).success, false);
  assert.equal(applicationSchema.safeParse({ ...valid, investReady: 'maybe' }).success, false);
  assert.equal(applicationSchema.safeParse({ ...valid, goal: '' }).success, false);
  assert.equal(applicationSchema.safeParse({ ...valid, goal: 'x'.repeat(1501) }).success, false);
  assert.equal(applicationSchema.safeParse({}).success, false);
});

test('a filled honeypot marks a bot', () => {
  assert.equal(isBot({ company: '' }), false);
  assert.equal(isBot({ company: 'Acme LLC' }), true);
});

test('the same email inside the window is a duplicate, outside it is a new application', () => {
  const now = new Date('2026-10-31T12:00:00Z');
  assert.equal(isRecentDuplicate(null, now), false);
  assert.equal(isRecentDuplicate(new Date(now.getTime() - 60_000), now), true);
  assert.equal(isRecentDuplicate(new Date(now.getTime() - DUPLICATE_WINDOW_MS - 1), now), false);
});

test('only the five pipeline statuses can be set', () => {
  assert.equal(isApplicationStatus('call_booked'), true);
  assert.equal(isApplicationStatus('deleted'), false);
  assert.equal(isApplicationStatus(undefined), false);
});

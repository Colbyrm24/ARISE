import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ageOn,
  conversionPercent,
  featuresFor,
  hiddenRoutes,
  isMinor,
  normalizeSlug,
  parseBirthDate,
  tierOf,
  toCents,
} from '../membership';

const day = (s: string) => new Date(`${s}T00:00:00Z`);
const TODAY = day('2026-10-23');

describe('ageOn', () => {
  test('turns a year older on the birthday, not the day after', () => {
    assert.equal(ageOn(day('2013-10-23'), TODAY), 13);
    assert.equal(ageOn(day('2013-10-24'), TODAY), 12);
  });
  test('leap-day birthdays', () => {
    assert.equal(ageOn(day('2012-02-29'), day('2025-02-28')), 12);
    assert.equal(ageOn(day('2012-02-29'), day('2025-03-01')), 13);
  });
});

describe('parseBirthDate', () => {
  test('13 today is allowed; 13 tomorrow is not', () => {
    assert.equal(parseBirthDate('2013-10-23', TODAY).ok, true);
    const r = parseBirthDate('2013-10-24', TODAY);
    assert.equal(r.ok, false);
  });
  test('refuses junk, impossible and future dates', () => {
    assert.equal(parseBirthDate('', TODAY).ok, false);
    assert.equal(parseBirthDate('2010-02-30', TODAY).ok, false);
    assert.equal(parseBirthDate('2030-01-01', TODAY).ok, false);
    assert.equal(parseBirthDate('1890-01-01', TODAY).ok, false);
    assert.equal(parseBirthDate(undefined, TODAY).ok, false);
  });
});

describe('featuresFor', () => {
  test('coaching clients get everything, at any age', () => {
    const f = featuresFor({ tier: 'coaching', birthDate: day('2011-01-01') }, TODAY);
    assert.ok(Object.values(f).every(Boolean));
  });
  test('an adult member gets weight and photos but not the coach-only parts', () => {
    const f = featuresFor({ tier: 'program', birthDate: day('2000-01-01') }, TODAY);
    assert.equal(f.weight, true);
    assert.equal(f.photos, true);
    assert.equal(f.messages, false);
    assert.equal(f.nutrition, false);
    assert.equal(f.booking, false);
  });
  test('a minor member gets no weigh-ins or photos', () => {
    const f = featuresFor({ tier: 'program', birthDate: day('2010-06-01') }, TODAY);
    assert.equal(f.weight, false);
    assert.equal(f.photos, false);
  });
  test('a member with no birth date is treated as a minor', () => {
    const f = featuresFor({ tier: 'program', birthDate: null }, TODAY);
    assert.equal(f.photos, false);
  });
  test('an unknown tier is coaching, so nobody loses access by accident', () => {
    assert.equal(tierOf(undefined), 'coaching');
    assert.equal(tierOf('something'), 'coaching');
  });
  test('hidden routes for a member', () => {
    const hidden = hiddenRoutes(featuresFor({ tier: 'program', birthDate: null }, TODAY));
    assert.deepEqual(hidden.sort(), ['/book', '/check-in', '/messages', '/nutrition', '/recipes'].sort());
  });
});

describe('isMinor', () => {
  test('18th birthday is the line', () => {
    assert.equal(isMinor(day('2008-10-23'), TODAY), false);
    assert.equal(isMinor(day('2008-10-24'), TODAY), true);
    assert.equal(isMinor(null, TODAY), false);
  });
});

describe('toCents', () => {
  test('no float drift', () => {
    assert.equal(toCents('16.99'), 1699);
    assert.equal(toCents('$16.99'), 1699);
    assert.equal(toCents(16.99), 1699);
    assert.equal(toCents('20'), 2000);
    assert.equal(toCents('16.9'), 1690);
  });
  test('refuses junk and silly amounts', () => {
    assert.equal(toCents('abc'), null);
    assert.equal(toCents('0.50'), null);
    assert.equal(toCents('16.999'), null);
    assert.equal(toCents('5000'), null);
  });
});

describe('normalizeSlug', () => {
  test('makes a bio-friendly address', () => {
    assert.equal(normalizeSlug('  Colby Split! '), 'colby-split');
    assert.equal(normalizeSlug('a'), null);
  });
});

describe('conversionPercent', () => {
  test('one decimal, null with no visitors', () => {
    assert.equal(conversionPercent(200, 9), 4.5);
    assert.equal(conversionPercent(0, 0), null);
  });
});

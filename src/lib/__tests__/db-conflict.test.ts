import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isUniqueViolation, codeOf } from '../db-conflict';

describe('isUniqueViolation', () => {
  test('recognises the unique-constraint violation', () => {
    assert.equal(isUniqueViolation({ code: 'P2002' }), true);
  });

  /*
    The reason this is a named check rather than an inline comparison. The
    booking action treats EVERY failure as a conflict, so with the database
    unreachable it told clients that every slot had just been taken — five
    slots, five times, nothing logged. "This row exists" and "the database is
    down" arrive at the same catch block and must not be confused.
  */
  test('a different Prisma error is not a conflict', () => {
    assert.equal(isUniqueViolation({ code: 'P2003' }), false); // foreign key
    assert.equal(isUniqueViolation({ code: 'P2025' }), false); // record not found
    assert.equal(isUniqueViolation({ code: 'P1001' }), false); // cannot reach database
  });

  test('a connection failure is not a conflict', () => {
    assert.equal(isUniqueViolation(new Error('Connection terminated unexpectedly')), false);
    assert.equal(isUniqueViolation('P2002'), false);
    assert.equal(isUniqueViolation(null), false);
    assert.equal(isUniqueViolation(undefined), false);
  });

  test('a non-string code is not read as one', () => {
    assert.equal(isUniqueViolation({ code: 2002 }), false);
    assert.equal(codeOf({ code: 2002 }), null);
  });

  test('codeOf hands back the code for logging', () => {
    assert.equal(codeOf({ code: 'P1001' }), 'P1001');
    assert.equal(codeOf(new Error('nope')), null);
  });
});

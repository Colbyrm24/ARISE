import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { contractProgress, chargesRemaining, contractOverrunning } from '../contract';

describe('contractProgress', () => {
  test('the ordinary case: part-way through a stated total', () => {
    const p = contractProgress(4500, 1000);
    assert.equal(p?.total, 4500);
    assert.equal(p?.paid, 1000);
    assert.equal(p?.remaining, 3500);
    assert.equal(p?.percent, 22);
    assert.equal(p?.met, false);
  });

  test('no total means nothing to measure — a fixed plan says it in payments', () => {
    assert.equal(contractProgress(null, 1000), null);
    assert.equal(contractProgress(undefined, 1000), null);
  });

  test('a zero or negative total is not a contract', () => {
    assert.equal(contractProgress(0, 0), null);
    assert.equal(contractProgress(-500, 0), null);
  });

  test('exactly met', () => {
    const p = contractProgress(4500, 4500);
    assert.equal(p?.met, true);
    assert.equal(p?.remaining, 0);
    assert.equal(p?.percent, 100);
  });

  /*
    The failure this whole module exists to stop. Eleven charges of $409.09
    sum to 4499.990000000001 in floating point, not 4499.99, so a float
    comparison leaves `met` false, the coach is never told to stop, and the
    client is charged a twelfth time for a contract they finished.
  */
  test('float dust does not leave a finished contract running', () => {
    const paid = Array.from({ length: 11 }).reduce<number>((sum) => sum + 409.09, 0);
    assert.notEqual(paid, 4499.99); // the dust is real
    const p = contractProgress(4499.99, paid);
    assert.equal(p?.met, true);
    assert.equal(p?.remaining, 0);
  });

  test('an overpayment is done, not owed a negative amount', () => {
    const p = contractProgress(4500, 5000);
    assert.equal(p?.met, true);
    assert.equal(p?.remaining, 0);
    assert.equal(p?.percent, 100);
  });

  test('nothing paid yet', () => {
    const p = contractProgress(4500, 0);
    assert.equal(p?.paid, 0);
    assert.equal(p?.remaining, 4500);
    assert.equal(p?.percent, 0);
    assert.equal(p?.met, false);
  });

  test('a nonsense paid figure is treated as nothing paid, not as progress', () => {
    assert.equal(contractProgress(4500, Number.NaN)?.paid, 0);
    assert.equal(contractProgress(4500, -100)?.remaining, 4500);
  });
});

describe('chargesRemaining', () => {
  test('rounds up — a part charge is still a charge', () => {
    assert.equal(chargesRemaining(3500, 250), 14);
    assert.equal(chargesRemaining(100, 250), 1);
  });

  test('nothing left to charge', () => {
    assert.equal(chargesRemaining(0, 250), 0);
  });

  test('an unusable price has no honest answer', () => {
    assert.equal(chargesRemaining(3500, 0), null);
    assert.equal(chargesRemaining(3500, Number.NaN), null);
  });
});

describe('contractOverrunning', () => {
  const active = { status: 'active', cancelAtPeriodEnd: false };

  test('a rolling plan that has hit its total is about to overcharge', () => {
    assert.equal(contractOverrunning(contractProgress(4500, 4500), active), true);
  });

  test('mid-contract is not an overrun', () => {
    assert.equal(contractOverrunning(contractProgress(4500, 1000), active), false);
  });

  test('no stated total, nothing to overrun', () => {
    assert.equal(contractOverrunning(null, active), false);
  });

  test('already winding down is not an overrun — he has dealt with it', () => {
    assert.equal(
      contractOverrunning(contractProgress(4500, 4500), { status: 'active', cancelAtPeriodEnd: true }),
      false
    );
  });

  test('a subscription that is not billing cannot overcharge anyone', () => {
    for (const status of ['canceled', 'completed', 'past_due']) {
      assert.equal(
        contractOverrunning(contractProgress(4500, 4500), { status, cancelAtPeriodEnd: false }),
        false
      );
    }
  });

  test('a null cancelAtPeriodEnd is not a cancellation', () => {
    assert.equal(
      contractOverrunning(contractProgress(4500, 4500), { status: 'active', cancelAtPeriodEnd: null }),
      true
    );
  });
});

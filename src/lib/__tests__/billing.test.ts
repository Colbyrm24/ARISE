import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  requiredPayments,
  isPaidInFull,
  paymentsRemaining,
  localSubscriptionStatus,
  mergeStatus,
  invoiceRole,
  amountFromCents,
  parsePrice,
  parseCount,
} from '../billing';

describe('requiredPayments', () => {
  test('a fixed payment plan owes exactly its agreed count', () => {
    assert.equal(requiredPayments({ billingType: 'payment_plan', numberOfPayments: 6 }), 6);
  });

  test('an ongoing subscription is open-ended', () => {
    assert.equal(requiredPayments({ billingType: 'subscription', numberOfPayments: null }), null);
  });

  test('an ongoing subscription stays open-ended even if a count is set', () => {
    // A stray count on a subscription plan must not silently cancel it.
    assert.equal(requiredPayments({ billingType: 'subscription', numberOfPayments: 6 }), null);
  });

  test('a one-time plan is capped at one payment', () => {
    // It should never have become a subscription; if it did, stop at one
    // rather than billing forever.
    assert.equal(requiredPayments({ billingType: 'one_time', numberOfPayments: null }), 1);
  });

  test('a fixed plan with no count is left running rather than guessed at', () => {
    assert.equal(requiredPayments({ billingType: 'payment_plan', numberOfPayments: null }), null);
    assert.equal(requiredPayments({ billingType: 'payment_plan', numberOfPayments: 0 }), null);
  });
});

describe('isPaidInFull', () => {
  test('is false partway through a plan', () => {
    assert.equal(isPaidInFull(3, 6), false);
  });

  test('is true on the final payment', () => {
    assert.equal(isPaidInFull(6, 6), true);
  });

  test('is true past the final payment, so a double-record still stops billing', () => {
    // The bug this guards: an === check would step over the boundary and
    // charge the client every month forever.
    assert.equal(isPaidInFull(7, 6), true);
  });

  test('is never true for an open-ended subscription', () => {
    assert.equal(isPaidInFull(99, null), false);
  });
});

describe('paymentsRemaining', () => {
  test('counts down', () => {
    assert.equal(paymentsRemaining(2, 6), 4);
  });

  test('never goes negative', () => {
    assert.equal(paymentsRemaining(8, 6), 0);
  });

  test('is null when open-ended', () => {
    assert.equal(paymentsRemaining(2, null), null);
  });
});

describe('localSubscriptionStatus', () => {
  test('active and trialing both read as active', () => {
    assert.equal(localSubscriptionStatus('active'), 'active');
    assert.equal(localSubscriptionStatus('trialing'), 'active');
  });

  test('a declining card reads as past due', () => {
    assert.equal(localSubscriptionStatus('past_due'), 'past_due');
    assert.equal(localSubscriptionStatus('unpaid'), 'past_due');
    assert.equal(localSubscriptionStatus('incomplete'), 'past_due');
  });

  test('cancelled states read as canceled', () => {
    assert.equal(localSubscriptionStatus('canceled'), 'canceled');
    assert.equal(localSubscriptionStatus('incomplete_expired'), 'canceled');
  });

  test('an unrecognised status leaves the plan looking live', () => {
    // Safer to show a live plan than to tell a coach a paying client quit.
    assert.equal(localSubscriptionStatus('something_new_from_stripe'), 'active');
  });
});

describe('mergeStatus', () => {
  test('a completed plan is not downgraded when Stripe reports the cancel', () => {
    // Cancelling a finished plan makes Stripe send subscription.deleted a
    // moment later. Without this, a client who paid in full shows up in the
    // console as though they quit.
    assert.equal(mergeStatus('completed', 'canceled'), 'completed');
  });

  test('anything else takes the incoming status', () => {
    assert.equal(mergeStatus('active', 'past_due'), 'past_due');
    assert.equal(mergeStatus('past_due', 'active'), 'active');
    assert.equal(mergeStatus('active', 'canceled'), 'canceled');
  });
});

describe('invoiceRole', () => {
  test('the signup invoice is the first one', () => {
    assert.equal(invoiceRole('subscription_create'), 'first');
  });

  test('every later cycle is a renewal', () => {
    assert.equal(invoiceRole('subscription_cycle'), 'renewal');
    assert.equal(invoiceRole('subscription_update'), 'renewal');
    assert.equal(invoiceRole(null), 'renewal');
    assert.equal(invoiceRole(undefined), 'renewal');
  });
});

describe('amountFromCents', () => {
  test('converts minor units to dollars', () => {
    assert.equal(amountFromCents(30000), 300);
    assert.equal(amountFromCents(4999), 49.99);
  });

  test('a missing amount is zero, not NaN', () => {
    assert.equal(amountFromCents(null), 0);
    assert.equal(amountFromCents(undefined), 0);
    assert.equal(amountFromCents(Number.NaN), 0);
  });
});

describe('parsePrice', () => {
  test('reads a normal price', () => {
    assert.equal(parsePrice('300'), 300);
    assert.equal(parsePrice(' 49.99 '), 49.99);
  });

  test('an empty field means "no override"', () => {
    assert.equal(parsePrice(''), null);
    assert.equal(parsePrice('   '), null);
    assert.equal(parsePrice(null), null);
  });

  test('junk is rejected instead of becoming NaN', () => {
    // NaN used to reach Math.round(NaN * 100) inside the Stripe call and
    // 500 the page the coach was standing on.
    assert.equal(parsePrice('abc'), null);
    assert.equal(parsePrice('12abc'), null);
  });

  test('zero and negatives are rejected', () => {
    assert.equal(parsePrice('0'), null);
    assert.equal(parsePrice('-50'), null);
  });

  test('rounds to cents', () => {
    assert.equal(parsePrice('10.005'), 10.01);
    assert.equal(parsePrice('33.333'), 33.33);
  });
});

describe('parseCount', () => {
  test('reads a whole count', () => {
    assert.equal(parseCount('6'), 6);
  });

  test('rejects junk, zero, negatives and fractions', () => {
    assert.equal(parseCount('abc'), null);
    assert.equal(parseCount('0'), null);
    assert.equal(parseCount('-3'), null);
    assert.equal(parseCount('2.5'), null);
  });

  test('an empty field means "not set"', () => {
    assert.equal(parseCount(''), null);
    assert.equal(parseCount(null), null);
  });
});

describe('the payment-plan lifecycle end to end', () => {
  test('a six-payment plan stops after six and not before', () => {
    const terms = { billingType: 'payment_plan' as const, numberOfPayments: 6 };
    const required = requiredPayments(terms);

    const stoppedAt: number[] = [];
    for (let paid = 1; paid <= 8; paid++) {
      if (isPaidInFull(paid, required)) stoppedAt.push(paid);
    }

    // Payments 1-5 keep billing; 6 onward is paid in full.
    assert.deepEqual(stoppedAt, [6, 7, 8]);
  });

  test('an ongoing subscription never stops on its own', () => {
    const required = requiredPayments({ billingType: 'subscription', numberOfPayments: null });
    for (let paid = 1; paid <= 60; paid++) {
      assert.equal(isPaidInFull(paid, required), false);
    }
  });
});

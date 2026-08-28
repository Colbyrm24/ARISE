import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyStripePrice,
  frequencyFromInterval,
  type StripePriceLike,
} from '../stripe-prices';

const product = { id: 'prod_1', name: 'Elite Coaching' };

function price(overrides: Partial<StripePriceLike> = {}): StripePriceLike {
  return {
    id: 'price_1',
    currency: 'usd',
    unit_amount: 30000,
    billing_scheme: 'per_unit',
    product,
    ...overrides,
  };
}

test('a monthly recurring price becomes an ongoing subscription plan', () => {
  const result = classifyStripePrice(
    price({ recurring: { interval: 'month', interval_count: 1 } })
  );
  assert.equal(result.supported, true);
  if (!result.supported) return;
  assert.equal(result.billingType, 'subscription');
  assert.equal(result.paymentFrequency, 'monthly');
  // Cents in Stripe, dollars on the plan — this is the conversion that ends
  // up printed on a signed agreement.
  assert.equal(result.amount, 300);
  assert.equal(result.name, 'Elite Coaching');
});

test('a price with no recurrence is a one-time plan', () => {
  const result = classifyStripePrice(price({ unit_amount: 149900 }));
  assert.equal(result.supported, true);
  if (!result.supported) return;
  assert.equal(result.billingType, 'one_time');
  assert.equal(result.paymentFrequency, null);
  assert.equal(result.amount, 1499);
});

test('every-two-weeks maps to biweekly, and yearly is refused', () => {
  assert.equal(frequencyFromInterval('week', 2), 'biweekly');
  assert.equal(frequencyFromInterval('week', 1), 'weekly');
  assert.equal(frequencyFromInterval('month', 1), 'monthly');
  // No agreement sentence exists for these, so they must not import.
  assert.equal(frequencyFromInterval('year', 1), null);
  assert.equal(frequencyFromInterval('month', 3), null);
  assert.equal(frequencyFromInterval('day', 1), null);
});

test('a yearly price is refused rather than silently billed as monthly', () => {
  const result = classifyStripePrice(
    price({ recurring: { interval: 'year', interval_count: 1 } })
  );
  assert.equal(result.supported, false);
  if (result.supported) return;
  assert.match(result.reason, /weekly/);
});

test('non-USD, tiered, and metered prices are refused', () => {
  const eur = classifyStripePrice(price({ currency: 'eur' }));
  assert.equal(eur.supported, false);

  const tiered = classifyStripePrice(price({ billing_scheme: 'tiered', unit_amount: null }));
  assert.equal(tiered.supported, false);

  const metered = classifyStripePrice(
    price({ recurring: { interval: 'month', interval_count: 1, usage_type: 'metered' } })
  );
  assert.equal(metered.supported, false);
});

test('a nickname is folded into the plan name so two prices on one product differ', () => {
  const result = classifyStripePrice(
    price({ nickname: '6 month', recurring: { interval: 'month', interval_count: 1 } })
  );
  assert.equal(result.supported, true);
  if (!result.supported) return;
  assert.equal(result.name, 'Elite Coaching — 6 month');
});

test('an unexpanded product still classifies, using the price id as the label', () => {
  const result = classifyStripePrice(price({ product: 'prod_1', nickname: null }));
  assert.equal(result.supported, true);
  if (!result.supported) return;
  assert.equal(result.productId, 'prod_1');
  assert.equal(result.name, 'price_1');
});

/*
  The migration week, in test form.

  He is moving a book of clients off another platform this week. Several of
  them already have accounts here. Every case below is a way an invite could
  take somebody who is fine and make them worse off — which is the only kind
  of bug that matters on this path, because the person it happens to is a
  paying client who was told this would be easy.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { arrivingStatus, statusForExistingClient } from '@/lib/invite-arrival';
import type { ClientStatus } from '@prisma/client';

const s = (v: string) => v as ClientStatus;

test('a paying invite lands at payment, an existing-client invite at the intake', () => {
  assert.equal(arrivingStatus(false), 'payment_pending');
  assert.equal(arrivingStatus(true), 'onboarding');
});

test('a brand new lead is moved to wherever the invite points', () => {
  assert.equal(statusForExistingClient(s('lead'), s('payment_pending')), 'payment_pending');
  assert.equal(statusForExistingClient(s('lead'), s('onboarding')), 'onboarding');
});

test('somebody who never paid can be let in on an existing-client link', () => {
  // How he rescues a client who bounced off a checkout: re-invite them with
  // the skip-payment box ticked.
  assert.equal(statusForExistingClient(s('payment_pending'), s('onboarding')), 'onboarding');
});

test('an existing-client link lets in somebody paused or cancelled', () => {
  /*
    Not an edge case. Cancelling their old Stripe subscription is how he stops
    billing them here, and customer.subscription.deleted sets paused on the
    way through — so the client he is moving across is very often paused at
    the moment he sends the link. Refusing them here would sign them up, tell
    them there was nothing to pay, and then bounce them off every screen onto
    "your last payment did not go through".
  */
  assert.equal(statusForExistingClient(s('paused'), s('onboarding')), 'onboarding');
  assert.equal(statusForExistingClient(s('cancelled'), s('onboarding')), 'onboarding');
  assert.equal(statusForExistingClient(s('paid'), s('onboarding')), 'onboarding');
});

test('a paying link does not move anyone but a fresh lead', () => {
  // Mid-purchase belongs to the payment webhook; paused and cancelled are
  // records, and a checkout will move them itself when the money lands.
  assert.equal(statusForExistingClient(s('paused'), s('payment_pending')), null);
  assert.equal(statusForExistingClient(s('cancelled'), s('payment_pending')), null);
});

test('a client already in the app is never pushed back out to pay', () => {
  // The failure this function exists to prevent.
  assert.equal(statusForExistingClient(s('onboarding'), s('payment_pending')), null);
  assert.equal(statusForExistingClient(s('active'), s('payment_pending')), null);
  assert.equal(statusForExistingClient(s('ending_soon'), s('payment_pending')), null);
});

test('an active client re-using a link is left alone entirely', () => {
  assert.equal(statusForExistingClient(s('active'), s('onboarding')), null);
});

test('a completed client is left exactly as they are', () => {
  // completed is an entitled status: they still have the app.
  assert.equal(statusForExistingClient(s('completed'), s('onboarding')), null);
  assert.equal(statusForExistingClient(s('completed'), s('payment_pending')), null);
});

test('somebody mid-payment is not written over with the same status', () => {
  // No write means no needless updatedAt churn on the client row.
  assert.equal(statusForExistingClient(s('payment_pending'), s('payment_pending')), null);
  assert.equal(statusForExistingClient(s('onboarding'), s('onboarding')), null);
});

test('a client who has paid but not signed is not knocked back by a paying link', () => {
  assert.equal(statusForExistingClient(s('paid'), s('payment_pending')), null);
  assert.equal(statusForExistingClient(s('agreement_pending'), s('payment_pending')), null);
});

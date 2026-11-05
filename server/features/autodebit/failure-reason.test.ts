import assert from 'node:assert/strict';
import test from 'node:test';
import { ownerFailureReason } from './failure-reason';

test('maps Razorpay wording to ours', () => {
  assert.match(ownerFailureReason('BAD_REQUEST_ERROR', 'insufficient_funds', 'Payment failed'), /balance/);
  assert.match(ownerFailureReason(null, 'card_expired'), /expired/);
  assert.match(ownerFailureReason('BAD_REQUEST_ERROR', 'mandate_revoked'), /cancelled/);
  assert.match(ownerFailureReason(null, 'payment_declined', 'Declined by the issuing bank'), /bank declined/);
});

test('falls back safely', () => {
  assert.equal(ownerFailureReason(), 'The payment didn’t go through.');
  assert.equal(ownerFailureReason('GATEWAY_ERROR', 'server_error'), 'The payment didn’t go through.');
});

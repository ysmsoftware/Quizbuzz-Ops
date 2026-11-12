import assert from 'node:assert/strict';
import test from 'node:test';
import { eventPassBasePrice, eventPassQuote, upTo99 } from '@/lib/pricing/event-pass';

test('base price matches the tier sheet anchors and samples', () => {
  const expected: Record<number, number> = {
    50: 1499, 100: 1499, 200: 2399, 300: 3299, 500: 4999, 750: 6999, 1000: 8999, 1500: 12699,
    2000: 16399, 2500: 19999, 3000: 22999, 7500: 47499, 15000: 81699, 25000: 124999,
  };
  for (const [p, price] of Object.entries(expected)) assert.equal(eventPassBasePrice(Number(p)), price, `${p} participants`);
});

test('price only rises with participants', () => {
  let last = 0;
  for (let p = 100; p <= 25000; p += 50) {
    const price = eventPassBasePrice(p);
    assert.ok(price >= last, `${p}: ${price} < ${last}`);
    last = price;
  }
});

test('rounds up to …99', () => {
  assert.equal(upTo99(2374), 2399);
  assert.equal(upTo99(2399), 2399);
  assert.equal(upTo99(2400), 2499);
});

test('add-ons, GST and revenue share', () => {
  const q = eventPassQuote({ participants: 500, extraContests: 1, aiQuestionsHundreds: 2, whatsapp: true, engineer: true, entryFee: 100 });
  assert.equal(q.basePrice, 4999);
  assert.equal(q.extraContestsPrice, 1249.75);
  assert.equal(q.price, 4999 + 1249.75 + 998 + 150 + 4999);
  assert.equal(q.gst, Math.round(q.price * 0.18 * 100) / 100);
  // ₹100 fee: ₹97.64 net, 15% ≈ ₹14.65, payout ₹82.99 (tier sheet example).
  assert.equal(q.revenueShare?.netPerRegistration, 97.64);
  assert.equal(q.revenueShare?.sharePerRegistration, 14.65);
  assert.equal(q.revenueShare?.payoutPerRegistration, 82.99);
  // A tiny fee still pays the ₹5 minimum.
  assert.equal(eventPassQuote({ participants: 100, entryFee: 10 }).revenueShare?.sharePerRegistration, 5);
  assert.equal(eventPassQuote({ participants: 30000 }).talkToUs, true);
  assert.equal(eventPassQuote({ participants: 200 }).soloIsCheaper, true);
});

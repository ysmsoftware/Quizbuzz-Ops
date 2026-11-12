import assert from 'node:assert/strict';
import test from 'node:test';
import { computeAccessDates, lapseStatusAt, usageWindow } from './access-dates';
import { computeEffectiveLimits } from './effective-limits';

const end = new Date('2026-12-01T00:00:00Z');
const sub = { kind: 'STANDARD', currentPeriodEnd: end, graceDays: 7 };
const day = (d: string) => new Date(`${d}T00:00:00Z`);

test('free never lapses', () => {
  assert.deepEqual(computeAccessDates({ ...sub, kind: 'FREE' }), { restrictAt: null, downgradeAt: null });
  assert.equal(lapseStatusAt({ ...sub, kind: 'FREE' }, day('2030-01-01')), 'ACTIVE');
});

test('a paid plan moves through past due, restricted and expired', () => {
  assert.equal(lapseStatusAt(sub, day('2026-11-30')), 'ACTIVE');
  assert.equal(lapseStatusAt(sub, day('2026-12-01')), 'PAST_DUE');
  assert.equal(lapseStatusAt(sub, day('2026-12-07')), 'PAST_DUE');
  assert.equal(lapseStatusAt(sub, day('2026-12-08')), 'RESTRICTED');
  assert.equal(lapseStatusAt(sub, day('2026-12-30')), 'RESTRICTED');
  assert.equal(lapseStatusAt(sub, day('2026-12-31')), 'EXPIRED');
});

test('a contract grace longer than 30 days moves the downgrade with it', () => {
  const { restrictAt, downgradeAt } = computeAccessDates({ ...sub, graceDays: 45 });
  assert.equal(restrictAt?.getTime(), downgradeAt?.getTime());
});

test('usage window is one month on any cycle, and clamps short months', () => {
  const w = usageWindow(day('2026-01-31'), day('2026-03-15'));
  assert.equal(w.start.toISOString().slice(0, 10), '2026-02-28');
  assert.equal(w.end.toISOString().slice(0, 10), '2026-03-31');
  const start = usageWindow(day('2026-01-10'), day('2026-02-10'));
  assert.equal(start.start.toISOString().slice(0, 10), '2026-02-10');
  const before = usageWindow(day('2026-01-10'), day('2026-02-09'));
  assert.equal(before.start.toISOString().slice(0, 10), '2026-01-10');
});

test('unlimited override replaces the limit, additive still stacks', () => {
  const plan = { maxContestsPerCycle: 10, maxParticipantsPerContest: 100, maxQuestionsPerContest: 25, maxOrgMembers: 1, maxLearners: 0, maxCandidatesPerMonth: null, aiCreditsPerMonth: 0 };
  const at = new Date();
  const limits = computeEffectiveLimits(plan, [
    { field: 'maxContestsPerCycle', value: null, mode: 'ABSOLUTE', expiresAt: null, createdAt: at },
    { field: 'maxLearners', value: 50, mode: 'ADDITIVE', expiresAt: null, createdAt: at },
  ]);
  assert.equal(limits.maxContestsPerCycle.value, null);
  assert.equal(limits.maxLearners.value, 50);
});

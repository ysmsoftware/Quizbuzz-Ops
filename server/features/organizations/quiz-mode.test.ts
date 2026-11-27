// The ops contest list's read-only quiz mode: preset, attempts and sections (main-app Contest.quizSettings).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quizModeOf } from './quiz-mode';

test('no settings = an exam with one attempt and no sections (today)', () => {
  assert.deepEqual(quizModeOf(null, 0), { preset: 'EXAM', maxAttempts: 1, sectionCount: 0 });
});

test('reads the preset and attempts from the settings JSON', () => {
  assert.deepEqual(quizModeOf({ preset: 'PRACTICE', attempts: { max: 3 } }, 2), { preset: 'PRACTICE', maxAttempts: 3, sectionCount: 2 });
  assert.deepEqual(quizModeOf({ attempts: { max: null } }, 0), { preset: 'EXAM', maxAttempts: null, sectionCount: 0 });
});

test('ignores junk instead of failing the page', () => {
  assert.deepEqual(quizModeOf({ preset: 'WHATEVER', attempts: 'x' }, null), { preset: 'EXAM', maxAttempts: 1, sectionCount: 0 });
});

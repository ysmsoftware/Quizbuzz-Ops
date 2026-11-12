import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { ConflictError, NotFoundError, ValidationError } from './errors';
import { parseRequest } from './validation';
import { addOverrideSchema } from '../features/subscriptions/subscriptions.validator';

const post = (body: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(body) });

test('error subclasses keep their identity', () => {
  assert.ok(new NotFoundError() instanceof NotFoundError);
  assert.ok(new ConflictError() instanceof ConflictError);
});

test('parseRequest names the invalid field', async () => {
  const schema = z.object({ name: z.string().min(1, 'Name is required') });
  await assert.rejects(parseRequest(post({ name: '' }), schema), (err) => {
    assert.ok(err instanceof ValidationError);
    assert.equal(err.message, 'name: Name is required');
    return true;
  });
});

test('limit overrides reject unknown fields and non-numeric values', () => {
  const base = { reason: 'audit', field: 'maxOrgMembers' };
  assert.equal(addOverrideSchema.safeParse({ ...base, value: 5 }).success, true);
  assert.equal(addOverrideSchema.safeParse({ ...base, value: null }).success, true);
  assert.equal(addOverrideSchema.safeParse({ ...base, value: 'abc' }).success, false);
  assert.equal(addOverrideSchema.safeParse({ ...base, value: 1.5 }).success, false);
  assert.equal(addOverrideSchema.safeParse({ ...base, field: 'notARealField', value: 5 }).success, false);
  assert.equal(addOverrideSchema.safeParse({ ...base, field: 'featureProctoring', value: true }).success, true);
});

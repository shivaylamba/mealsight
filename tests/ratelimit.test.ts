import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { clientKey, createLimiter } from '../lib/ratelimit';

describe('createLimiter', () => {
  test('allows up to the limit, then says how long to wait', () => {
    const limiter = createLimiter(2, 60_000);
    assert.equal(limiter.check('a', 0), 0);
    assert.equal(limiter.check('a', 1_000), 0);
    assert.equal(limiter.check('a', 1_000), 59);
  });

  test('counts each address separately', () => {
    const limiter = createLimiter(1, 60_000);
    assert.equal(limiter.check('a', 0), 0);
    assert.equal(limiter.check('b', 0), 0);
    assert.ok(limiter.check('a', 0) > 0);
  });

  test('a new window starts clean', () => {
    const limiter = createLimiter(1, 60_000);
    limiter.check('a', 0);
    assert.ok(limiter.check('a', 59_999) > 0);
    assert.equal(limiter.check('a', 60_000), 0);
  });

  test('stays bounded under many addresses', () => {
    const limiter = createLimiter(1, 60_000, 3);
    for (const key of ['a', 'b', 'c', 'd', 'e']) assert.equal(limiter.check(key, 0), 0);
  });
});

describe('clientKey', () => {
  test('takes the first forwarded address', () => {
    assert.equal(clientKey(new Headers({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' })), '1.2.3.4');
  });

  test('falls back to x-real-ip, then a shared bucket', () => {
    assert.equal(clientKey(new Headers({ 'x-real-ip': '5.6.7.8' })), '5.6.7.8');
    assert.equal(clientKey(new Headers()), 'unknown');
  });
});

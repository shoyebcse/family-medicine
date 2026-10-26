import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AuthApi, AuthHttpError } from '../src/auth/api';
import { ApiRepository } from '../src/data/api';

test('revoked sessions invalidate protected UI but a forbidden member does not log out the account', async () => {
  const original = globalThis.fetch;
  let invalidations = 0;
  const repository = new ApiRepository('http://localhost:8080', 'fictional-token', () => {
    invalidations++;
  });
  try {
    for (const status of [403, 401]) {
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ message: 'Access denied' }), { status });
      await assert.rejects(repository.members(), /Access denied/);
      assert.equal(invalidations, status === 401 ? 1 : 0);
    }
  } finally {
    globalThis.fetch = original;
  }
});

test('server validation errors explain the rejected field', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          message: 'Check fields',
          fields: [{ field: 'email', message: 'must be valid' }],
        }),
        { status: 422 },
      );
    await assert.rejects(
      new AuthApi('http://localhost:8080').request('/register', {}),
      /email: must be valid/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('expired credentials differ from connection failures so reconnect keeps existing reminders', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: 'Sign in again' }), { status: 401 });
    await assert.rejects(
      new AuthApi('http://localhost:8080').request('/me'),
      (error: unknown) => error instanceof AuthHttpError && error.status === 401,
    );
    globalThis.fetch = async () => {
      throw new TypeError('Network unavailable');
    };
    await assert.rejects(
      new AuthApi('http://localhost:8080').request('/me'),
      (error: unknown) =>
        error instanceof Error &&
        !(error instanceof AuthHttpError) &&
        error.message.includes('connection'),
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('an unconfigured account service never sends credentials to a fallback destination', async () => {
  const original = globalThis.fetch;
  let called = false;
  try {
    globalThis.fetch = async () => {
      called = true;
      throw new Error('Unexpected request');
    };
    await assert.rejects(
      new AuthApi('').request('/login', {
        email: 'fictional@example.invalid',
        password: 'fictional',
      }),
      /not connected/,
    );
    assert.equal(called, false);
  } finally {
    globalThis.fetch = original;
  }
});

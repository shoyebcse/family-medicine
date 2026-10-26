import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sessionStorage } from '../src/auth/sessionStorage.web';

test('web sessions survive a new reader after reload and logout removes only the account session', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const data = new Map<string, string>([['unrelated', 'preserved']]);
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      sessionStorage: {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => data.set(key, value),
        removeItem: (key: string) => data.delete(key),
      },
    },
  });
  try {
    assert.equal(await sessionStorage.read(), null);
    await sessionStorage.write('fictional-session');
    assert.equal(await sessionStorage.read(), 'fictional-session');
    await sessionStorage.clear();
    assert.equal(await sessionStorage.read(), null);
    assert.equal(data.get('unrelated'), 'preserved');
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('web session restoration is safe during server rendering', async () => {
  assert.equal(await sessionStorage.read(), null);
  await sessionStorage.clear();
  await assert.rejects(sessionStorage.write('fictional-session'), /unavailable/);
});

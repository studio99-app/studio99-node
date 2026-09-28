// Offline tests: a fake fetch stands in for the API. Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Studio99, Studio99Error } from '../dist/index.js';

function fakeFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    const r = responses.shift();
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: r.headers ?? {} });
  };
  fn.calls = calls;
  return fn;
}

test('generate sends the key and body, returns data + usage + rate limit', async () => {
  const fetch = fakeFetch([{
    body: { success: true, data: { generatedResults: [], metadata: {} }, usage: { monthlyUsed: 4, monthlyLimit: 100, remaining: 96 } },
    headers: { 'X-RateLimit-Limit': '5', 'X-RateLimit-Remaining': '4', 'X-RateLimit-Reset': '1790000000' },
  }]);
  const s99 = new Studio99({ apiKey: 'k_test', fetch });
  const res = await s99.generate({ text: 'shubh vivah', language: 'hindi', count: 4 });

  const { url, init } = fetch.calls[0];
  assert.equal(url, 'https://studio99.app/api/v1/generate');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['X-API-Key'], 'k_test');
  assert.deepEqual(JSON.parse(init.body), { text: 'shubh vivah', language: 'hindi', count: 4 });
  assert.equal(res.usage.remaining, 96);
  assert.deepEqual(res.rateLimit, { limit: 5, remaining: 4, reset: 1790000000 });
});

test('query params skip undefined values', async () => {
  const fetch = fakeFetch([{ body: { success: true, data: { fonts: [] } } }]);
  await new Studio99({ apiKey: 'k', fetch }).fonts({ language: 'marathi', mood: undefined, limit: 10 });
  assert.equal(fetch.calls[0].url, 'https://studio99.app/api/v1/fonts?language=marathi&limit=10');
});

test('API errors become Studio99Error with the API code', async () => {
  const fetch = fakeFetch([{ status: 429, body: { success: false, error: { code: 'INSUFFICIENT_CREDITS', message: 'Monthly credits used up' } } }]);
  await assert.rejects(
    new Studio99({ apiKey: 'k', fetch }).render({ text: 'शुभ', fontId: 'f' }),
    (e) => e instanceof Studio99Error && e.code === 'INSUFFICIENT_CREDITS' && e.status === 429,
  );
  assert.equal(fetch.calls.length, 1, 'never retries INSUFFICIENT_CREDITS');
});

test('retries RATE_LIMIT_EXCEEDED, then succeeds', async () => {
  const fetch = fakeFetch([
    { status: 429, body: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'slow down' } } },
    { body: { success: true, data: { fonts: [] } } },
  ]);
  const res = await new Studio99({ apiKey: 'k', fetch }).fonts();
  assert.deepEqual(res.data, { fonts: [] });
  assert.equal(fetch.calls.length, 2);
});

test('a POST that failed on the network is not retried (no double charge)', async () => {
  const fetch = fakeFetch([new TypeError('socket hang up'), { body: { success: true, data: {} } }]);
  await assert.rejects(
    new Studio99({ apiKey: 'k', fetch }).generate({ text: 'x' }),
    (e) => e instanceof Studio99Error && e.code === 'NETWORK_ERROR',
  );
  assert.equal(fetch.calls.length, 1);
});

test('health returns the unwrapped body', async () => {
  const fetch = fakeFetch([{ body: { status: 'ok', version: '1.2', product: 'Studio99 Indic Typography API' } }]);
  const res = await new Studio99({ apiKey: 'k', fetch }).health();
  assert.equal(res.data.version, '1.2');
});

test('refuses to run in a browser', () => {
  globalThis.window = {};
  try {
    assert.throws(() => new Studio99({ apiKey: 'k' }), /server only/);
  } finally {
    delete globalThis.window;
  }
});

test('requires a key', () => {
  const saved = process.env.STUDIO99_API_KEY;
  delete process.env.STUDIO99_API_KEY;
  try {
    assert.throws(() => new Studio99(), /missing API key/);
  } finally {
    if (saved !== undefined) process.env.STUDIO99_API_KEY = saved;
  }
});

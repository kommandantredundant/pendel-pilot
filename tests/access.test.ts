import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createGrant, listGrants, revokeGrant, accessMe } from '../src/access/api.ts';
import { ACCESS_COOKIE, accessGate, extractCode, parseCookies, type AccessContext } from '../src/access/gate.ts';
import { GrantStore, parseCode, type AccessEnv, type KvNamespace } from '../src/access/store.ts';

/** In-memory KV with the semantics the store relies on (no edge cache, so revocation is immediate here). */
class FakeKv implements KvNamespace {
  readonly entries = new Map<string, { value: string; metadata?: unknown }>();
  async get(key: string) {
    return this.entries.get(key)?.value ?? null;
  }
  async put(key: string, value: string, options?: { metadata?: unknown }) {
    this.entries.set(key, { value, metadata: options?.metadata });
  }
  async delete(key: string) {
    this.entries.delete(key);
  }
  async list(options?: { prefix?: string }) {
    const keys = [...this.entries.entries()]
      .filter(([name]) => name.startsWith(options?.prefix ?? ''))
      .map(([name, entry]) => ({ name, metadata: entry.metadata }));
    return { keys, list_complete: true };
  }
}

/** KV whose list() does not show anything yet, as Cloudflare's can right after a write. */
class LaggingListKv extends FakeKv {
  override async list() {
    return { keys: [], list_complete: true };
  }
}

const ADMIN_CODE = 'admin-secret-for-tests-1234';
const ORIGIN = 'https://pendel.example';

async function run(env: AccessEnv, path: string, init: RequestInit = {}, cookie?: string) {
  const headers = new Headers(init.headers);
  if (cookie) headers.set('cookie', cookie);
  const data: Record<string, unknown> = {};
  const pending: Promise<unknown>[] = [];
  let nextCalled = false;
  const response = await accessGate({
    request: new Request(ORIGIN + path, { ...init, headers }),
    env,
    data,
    waitUntil: (promise) => pending.push(promise),
    next: async () => {
      nextCalled = true;
      return new Response('app');
    }
  });
  await Promise.all(pending);
  return { response, data, nextCalled, access: data.access as AccessContext | undefined };
}

function cookieFrom(response: Response): string {
  const cookies = response.headers.getSetCookie().map((line) => line.split(';')[0]);
  return cookies.join('; ');
}

async function adminCookie(env: AccessEnv): Promise<string> {
  const body = new URLSearchParams({ code: ADMIN_CODE });
  const { response } = await run(env, '/join', { method: 'POST', body });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/settings#access');
  return cookieFrom(response);
}

async function invite(env: AccessEnv, name: string, validDays: number | null = null) {
  const access: AccessContext = { role: 'admin' };
  const response = await createGrant(
    new Request(`${ORIGIN}/api/access/grants`, { method: 'POST', body: JSON.stringify({ name, validDays }) }),
    env,
    access
  );
  assert.equal(response.status, 201);
  return ((await response.json()) as { data: { code: string; link: string; grant: { id: string } } }).data;
}

describe('access by invitation', () => {
  it('leaves the site open while ADMIN_CODE is not set', async () => {
    const { nextCalled, response } = await run({ ACCESS: new FakeKv() }, '/towork');
    assert.equal(nextCalled, true);
    assert.equal(await response.text(), 'app');
    const me = await accessMe({}, undefined).json();
    assert.deepEqual(me, { success: true, data: { enabled: false, role: null } });
  });

  it('shows the code page for pages, refuses /api and keeps static files public', async () => {
    const env = { ADMIN_CODE, ACCESS: new FakeKv() };
    const page = await run(env, '/towork', { headers: { 'accept-language': 'de-DE,de;q=0.9' } });
    assert.equal(page.nextCalled, false);
    assert.equal(page.response.status, 401);
    assert.match(await page.response.text(), /Zugangscode/);

    const api = await run(env, '/api/stations/search?query=Berlin');
    assert.equal(api.response.status, 401);
    assert.equal(((await api.response.json()) as { error: { code: string } }).error.code, 'ACCESS_REQUIRED');

    for (const path of ['/manifest.webmanifest', '/assets/index-abc.js', '/icon-192.png']) {
      assert.equal((await run(env, path)).nextCalled, true, path);
    }
    assert.equal((await run(env, '/index.html')).nextCalled, false);
  });

  it('lets the admin in with ADMIN_CODE and logs them out when it changes', async () => {
    const env = { ADMIN_CODE, ACCESS: new FakeKv() };
    const cookie = await adminCookie(env);
    const inside = await run(env, '/settings', {}, cookie);
    assert.equal(inside.nextCalled, true);
    assert.deepEqual(inside.access, { role: 'admin' });

    const changed = await run({ ...env, ADMIN_CODE: 'a-new-admin-code-5678' }, '/settings', {}, cookie);
    assert.equal(changed.nextCalled, false);
    // The stale cookie is cleared.
    assert.match(changed.response.headers.getSetCookie().join('\n'), new RegExp(`${ACCESS_COOKIE}=; .*Max-Age=0`));
  });

  it('turns an invitation link into access until it is revoked', async () => {
    const kv = new FakeKv();
    const env = { ADMIN_CODE, ACCESS: kv };
    const { code, link, grant } = await invite(env, '  Max   Mustermann ');
    assert.equal(link, `${ORIGIN}/join/${code}`);
    assert.ok(parseCode(code));
    // Only the hash of the code is stored.
    assert.ok(![...kv.entries.values()].some((entry) => entry.value.includes(code.split('.')[1])));

    const join = await run(env, `/join/${code}`);
    assert.equal(join.response.status, 303);
    assert.equal(join.response.headers.get('location'), '/');
    const cookie = cookieFrom(join.response);

    const api = await run(env, '/api/journeys/calculate', { method: 'POST' }, cookie);
    assert.equal(api.nextCalled, true);
    assert.deepEqual(api.access, { role: 'guest', name: 'Max Mustermann', grantId: grant.id });

    const listed = (await (await listGrants(env, { role: 'admin' })).json()) as { data: { name: string; lastUsedAt: string | null }[] };
    assert.equal(listed.data.length, 1);
    assert.equal(listed.data[0].name, 'Max Mustermann');
    assert.ok(listed.data[0].lastUsedAt, 'joining records the use');

    assert.equal((await revokeGrant(grant.id, env, { role: 'admin' })).status, 200);
    const after = await run(env, '/api/journeys/calculate', { method: 'POST' }, cookie);
    assert.equal(after.nextCalled, false);
    assert.equal(after.response.status, 401);
    assert.equal((await revokeGrant(grant.id, env, { role: 'admin' })).status, 404);
  });

  it('accepts the code typed or pasted into the form', async () => {
    const env = { ADMIN_CODE, ACCESS: new FakeKv() };
    const { code, link } = await invite(env, 'Anna');
    for (const input of [code, link, ` ${link} `]) {
      const { response } = await run(env, '/join', { method: 'POST', body: new URLSearchParams({ code: input }) });
      assert.equal(response.status, 303, input);
    }
    const wrong = await run(env, '/join', { method: 'POST', body: new URLSearchParams({ code: `${code.slice(0, -1)}x` }) });
    assert.equal(wrong.response.status, 403);
    assert.equal(extractCode('https://x.example/join/abc.def?utm=1'), 'abc.def');
  });

  it('records the use once a day and renews the cookie then', async () => {
    const env = { ADMIN_CODE, ACCESS: new FakeKv() };
    const { code } = await invite(env, 'Tom');
    const today = new Date().toISOString().slice(0, 10);
    const fresh = await run(env, '/towork', {}, `${ACCESS_COOKIE}=${code}; pp_seen=${today}`);
    assert.equal(fresh.response.headers.getSetCookie().length, 0);
    const stale = await run(env, '/towork', {}, `${ACCESS_COOKIE}=${code}; pp_seen=2020-01-01`);
    const cookies = parseCookies(cookieFrom(stale.response));
    assert.equal(cookies[ACCESS_COOKIE], code);
    assert.equal(cookies.pp_seen, today);
  });

  it('refuses expired invitations and hides them from the list', async () => {
    const kv = new FakeKv();
    let now = new Date('2026-11-23T10:00:00Z');
    const store = new GrantStore(kv, () => now);
    const { code } = await store.create('Kurzbesuch', 1);
    assert.ok(await store.verify(code));
    now = new Date('2026-11-24T10:00:01Z');
    assert.equal(await store.verify(code), null);
    assert.deepEqual(await store.list(), []);
  });

  it('lets only the admin manage invitations and validates input', async () => {
    const env = { ADMIN_CODE, ACCESS: new FakeKv() };
    const request = () => new Request(`${ORIGIN}/api/access/grants`, { method: 'POST', body: JSON.stringify({ name: 'X' }) });
    assert.equal((await createGrant(request(), env, { role: 'guest', name: 'Max', grantId: 'abcdefgh' })).status, 403);
    assert.equal((await createGrant(request(), env, undefined)).status, 403);
    assert.equal((await listGrants(env, undefined)).status, 403);
    assert.equal((await createGrant(request(), { ADMIN_CODE }, { role: 'admin' })).status, 503);

    for (const body of [{ name: '' }, { name: 'x'.repeat(41) }, { name: 'X', validDays: 0 }, { name: 'X', validDays: 1.5 }]) {
      const response = await createGrant(
        new Request(`${ORIGIN}/api/access/grants`, { method: 'POST', body: JSON.stringify(body) }),
        env,
        { role: 'admin' }
      );
      assert.equal(response.status, 400, JSON.stringify(body));
    }
  });

  it('lists new invitations even while KV list() lags behind', async () => {
    const kv = new LaggingListKv();
    const store = new GrantStore(kv);
    const first = await store.create('Max', null);
    const second = await store.create('Anna', 30);
    assert.deepEqual((await store.list()).map((grant) => grant.name).sort(), ['Anna', 'Max']);
    await store.markSeen(first.grant.id);
    assert.ok((await store.list()).find((grant) => grant.name === 'Max')?.lastUsedAt);
    assert.equal(await store.revoke(second.grant.id), true);
    assert.deepEqual((await store.list()).map((grant) => grant.name), ['Max']);
  });

  it('still lists invitations made before the index existed', async () => {
    const kv = new FakeKv();
    const store = new GrantStore(kv);
    await store.create('Alt', null);
    kv.entries.delete('index:grants');
    assert.deepEqual((await store.list()).map((grant) => grant.name), ['Alt']);
  });
});

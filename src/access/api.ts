import {
  GRANT_MAX_VALID_DAYS,
  GRANT_NAME_MAX_LENGTH,
  JOIN_PATH,
  type AccessGrant,
  type AccessMe,
  type CreatedGrant
} from '../../shared/access.ts';
import { json, validationError } from '../utils/http.ts';
import type { AccessContext } from './gate.ts';
import { GrantStore, type AccessEnv } from './store.ts';

/** GET /api/access/me — tells the UI whether to show "Share access". */
export function accessMe(env: AccessEnv, access: AccessContext | undefined): Response {
  const me: AccessMe = env.ADMIN_CODE?.trim()
    ? { enabled: true, role: access?.role ?? null, ...(access?.name ? { name: access.name } : {}) }
    : { enabled: false, role: null };
  return json({ success: true, data: me }, { headers: { 'cache-control': 'no-store' } });
}

/** GET /api/access/grants — every invitation that still works. Admin only. */
export async function listGrants(env: AccessEnv, access: AccessContext | undefined): Promise<Response> {
  const store = adminStore(env, access);
  if (store instanceof Response) return store;
  const grants: AccessGrant[] = await store.list();
  return json({ success: true, data: grants }, { headers: { 'cache-control': 'no-store' } });
}

/** POST /api/access/grants { name, validDays? } — a new invitation; the answer is the only time its code is shown. */
export async function createGrant(request: Request, env: AccessEnv, access: AccessContext | undefined): Promise<Response> {
  const store = adminStore(env, access);
  if (store instanceof Response) return store;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationError('Body must be JSON.');
  }
  const { name, validDays } = (body ?? {}) as { name?: unknown; validDays?: unknown };
  const trimmed = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
  if (!trimmed || trimmed.length > GRANT_NAME_MAX_LENGTH) {
    return validationError(`name must be 1–${GRANT_NAME_MAX_LENGTH} characters.`, { field: 'name' });
  }
  if (validDays !== undefined && validDays !== null && (!Number.isInteger(validDays) || (validDays as number) < 1 || (validDays as number) > GRANT_MAX_VALID_DAYS)) {
    return validationError(`validDays must be a whole number from 1 to ${GRANT_MAX_VALID_DAYS}, or null.`, { field: 'validDays' });
  }

  const { grant, code } = await store.create(trimmed, (validDays as number | null | undefined) ?? null);
  const link = `${new URL(request.url).origin}${JOIN_PATH}/${code}`;
  const created: CreatedGrant = { grant, code, link };
  return json({ success: true, data: created }, { status: 201, headers: { 'cache-control': 'no-store' } });
}

/** DELETE /api/access/grants/:id — revokes an invitation (takes effect within about a minute). Admin only. */
export async function revokeGrant(id: string, env: AccessEnv, access: AccessContext | undefined): Promise<Response> {
  const store = adminStore(env, access);
  if (store instanceof Response) return store;
  if (!(await store.revoke(id))) {
    return json({ success: false, error: { code: 'NOT_FOUND', message: 'No invitation with this id.' } }, { status: 404 });
  }
  return json({ success: true, data: { revoked: id } });
}

function adminStore(env: AccessEnv, access: AccessContext | undefined): GrantStore | Response {
  if (access?.role !== 'admin') {
    return json({ success: false, error: { code: 'FORBIDDEN', message: 'Only the admin can manage invitations.' } }, { status: 403 });
  }
  if (!env.ACCESS) {
    return json(
      { success: false, error: { code: 'ACCESS_STORE_MISSING', message: 'The KV namespace ACCESS is not bound (see README, "Access by invitation").' } },
      { status: 503 }
    );
  }
  return new GrantStore(env.ACCESS);
}

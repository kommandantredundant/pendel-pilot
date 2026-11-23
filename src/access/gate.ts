import { JOIN_PATH } from '../../shared/access.ts';
import { GrantStore, constantTimeEqual, sha256Hex, type AccessEnv } from './store.ts';
import { loginPage, type LoginProblem } from './loginPage.ts';

/** Who the request comes from, put into the Pages Functions context as `data.access`. */
export interface AccessContext {
  role: 'admin' | 'guest';
  name?: string;
  grantId?: string;
}

export interface GateContext {
  request: Request;
  env: AccessEnv;
  next: () => Promise<Response>;
  data: Record<string, unknown>;
  waitUntil: (promise: Promise<unknown>) => void;
}

export const ACCESS_COOKIE = 'pp_access';
/** Day the guest's last use was recorded; keeps that write to once a day per device. */
const SEEN_COOKIE = 'pp_seen';
/** 400 days, the longest a browser keeps a cookie; renewed once a day while the app is used. */
const COOKIE_MAX_AGE = 400 * 24 * 3600;
const ADMIN_PREFIX = 'admin.';

/**
 * Access by invitation for the whole site (functions/_middleware.ts). Without ADMIN_CODE the site stays open.
 * With it, pages and /api need the access cookie, which /join/<code> or the code form sets. Other static files
 * (scripts, styles, icons, the web app manifest) stay public: the code is open source, and browsers fetch the
 * manifest and icons without cookies.
 */
export async function accessGate(context: GateContext): Promise<Response> {
  const { request, env } = context;
  const adminCode = env.ADMIN_CODE?.trim();
  if (!adminCode) return context.next();

  const url = new URL(request.url);
  if (url.pathname === JOIN_PATH || url.pathname.startsWith(`${JOIN_PATH}/`)) {
    return handleJoin(context, adminCode, url);
  }
  if (isPublicFile(url.pathname)) return context.next();

  const cookies = parseCookies(request.headers.get('cookie'));
  const access = await resolveAccess(cookies[ACCESS_COOKIE], adminCode, env);
  if (!access) {
    const clear = cookies[ACCESS_COOKIE] !== undefined;
    if (url.pathname.startsWith('/api/')) {
      return withCookies(
        Response.json(
          { success: false, error: { code: 'ACCESS_REQUIRED', message: 'An invitation is needed to use Pendel-Pilot.' } },
          { status: 401 }
        ),
        clear ? clearCookies() : []
      );
    }
    return withCookies(loginPage(request, null, 401), clear ? clearCookies() : []);
  }

  context.data.access = access;
  const response = await context.next();
  const today = new Date().toISOString().slice(0, 10);
  if (access.role !== 'guest' || !access.grantId || cookies[SEEN_COOKIE] === today || !env.ACCESS) return response;

  // Once a day: record the use for the admin list and renew the cookie, so a used invitation never runs out.
  context.waitUntil(new GrantStore(env.ACCESS).markSeen(access.grantId).catch((error) => console.error('[access] markSeen failed', error)));
  return withCookies(response, [accessCookie(cookies[ACCESS_COOKIE] as string), seenCookie(today)]);
}

async function handleJoin(context: GateContext, adminCode: string, url: URL): Promise<Response> {
  const { request, env } = context;
  let code = '';
  if (request.method === 'POST') {
    const form = await request.formData().catch(() => null);
    code = extractCode(String(form?.get('code') ?? ''));
  } else if (request.method === 'GET' || request.method === 'HEAD') {
    code = extractCode(url.pathname.slice(JOIN_PATH.length + 1) || url.searchParams.get('code') || '');
  } else {
    return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, POST' } });
  }
  if (!code) return loginPage(request, null, 200);

  const adminHash = await sha256Hex(`pendel-pilot-admin:${adminCode}`);
  if (constantTimeEqual(await sha256Hex(`pendel-pilot-admin:${code}`), adminHash)) {
    return withCookies(redirect('/settings#access'), [accessCookie(ADMIN_PREFIX + adminHash)]);
  }

  if (!env.ACCESS) {
    console.error('[access] ADMIN_CODE is set but the KV namespace ACCESS is not bound; invitations cannot be checked.');
    return loginPage(request, 'unavailable', 503);
  }
  const store = new GrantStore(env.ACCESS);
  const grant = await store.verify(code);
  if (!grant) return loginPage(request, 'invalid', 403);

  context.waitUntil(store.markSeen(grant.id).catch((error) => console.error('[access] markSeen failed', error)));
  return withCookies(redirect('/'), [accessCookie(code), seenCookie(new Date().toISOString().slice(0, 10))]);
}

async function resolveAccess(cookie: string | undefined, adminCode: string, env: AccessEnv): Promise<AccessContext | null> {
  if (!cookie) return null;
  if (cookie.startsWith(ADMIN_PREFIX)) {
    const expected = await sha256Hex(`pendel-pilot-admin:${adminCode}`);
    // Changing ADMIN_CODE logs the admin out everywhere.
    return constantTimeEqual(cookie.slice(ADMIN_PREFIX.length), expected) ? { role: 'admin' } : null;
  }
  if (!env.ACCESS) return null;
  const grant = await new GrantStore(env.ACCESS).verify(cookie);
  return grant ? { role: 'guest', name: grant.name, grantId: grant.id } : null;
}

/** Accepts the bare code, a pasted invitation link, or a link with ?code=. */
export function extractCode(input: string): string {
  let value = input.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    // Keep the raw text; it simply will not match.
  }
  const fromPath = value.match(/\/join\/([^/?#\s]+)/);
  if (fromPath) return fromPath[1];
  const fromQuery = value.match(/[?&]code=([^&#\s]+)/);
  if (fromQuery) return fromQuery[1];
  return value;
}

/** Static files other than pages: anything with an extension except .html. */
function isPublicFile(pathname: string): boolean {
  if (pathname.startsWith('/api/')) return false;
  const last = pathname.split('/').pop() ?? '';
  return last.includes('.') && !last.endsWith('.html');
}

export function parseCookies(header: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (name && !(name in cookies)) cookies[name] = part.slice(index + 1).trim();
  }
  return cookies;
}

function accessCookie(value: string): string {
  return `${ACCESS_COOKIE}=${value}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
}

function seenCookie(day: string): string {
  return `${SEEN_COOKIE}=${day}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
}

function clearCookies(): string[] {
  return [ACCESS_COOKIE, SEEN_COOKIE].map((name) => `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
}

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { location, 'cache-control': 'no-store' } });
}

/** Adds Set-Cookie headers; copies the response first, since responses from static assets are immutable. */
function withCookies(response: Response, cookies: string[]): Response {
  if (cookies.length === 0) return response;
  const copy = new Response(response.body, response);
  for (const cookie of cookies) copy.headers.append('set-cookie', cookie);
  return copy;
}

export type { LoginProblem };

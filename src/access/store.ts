import type { AccessGrant } from '../../shared/access.ts';

/**
 * The part of a Cloudflare KV namespace the access store uses (bound as ACCESS in wrangler.toml).
 * Declared here because the project has no @cloudflare/workers-types; tests pass an in-memory fake.
 */
export interface KvNamespace {
  get(key: string, options?: { cacheTtl?: number }): Promise<string | null>;
  put(key: string, value: string, options?: { metadata?: unknown; expiration?: number; expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; cursor?: string }): Promise<{
    keys: { name: string; metadata?: unknown }[];
    list_complete: boolean;
    cursor?: string;
  }>;
}

export interface AccessEnv {
  /** Secret. When set, the site needs an invitation; it is also the admin's own code. */
  ADMIN_CODE?: string;
  /** KV namespace holding the invitations. */
  ACCESS?: KvNamespace;
}

/** What is stored per invitation under grant:<id>. The code's secret part is only kept as a SHA-256 hash. */
interface GrantRecord {
  id: string;
  name: string;
  secretHash: string;
  createdAt: string;
  expiresAt: string | null;
}

const GRANT_PREFIX = 'grant:';
/**
 * The admin list as one document. KV's list() can show new keys only after a delay, so the list is kept here,
 * read and written with plain get/put by the admin (usually visible at once where it was written).
 */
const INDEX_KEY = 'index:grants';
/** Last use per invitation, kept apart so a late write can never bring a revoked invitation back. */
const SEEN_PREFIX = 'seen:';
/** Invitations are read through the edge cache for this long, so a revocation takes up to a minute. */
const GRANT_CACHE_SECONDS = 60;
const SEEN_TTL_SECONDS = 400 * 24 * 3600;

const ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const ID_LENGTH = 8;
/** A code is `<id>.<secret>`: 8 characters id, 16 random bytes as base64url. */
const CODE_PATTERN = /^([a-z2-9]{8})\.([A-Za-z0-9_-]{22})$/;

export function parseCode(code: string): { id: string; secret: string } | null {
  const match = CODE_PATTERN.exec(code.trim());
  return match ? { id: match[1], secret: match[2] } : null;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Compares two strings without returning early, so timing does not reveal how much matched. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ID_LENGTH));
  return [...bytes].map((byte) => ID_ALPHABET[byte % ID_ALPHABET.length]).join('');
}

function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function publicFields(record: GrantRecord): Omit<AccessGrant, 'lastUsedAt'> {
  return { id: record.id, name: record.name, createdAt: record.createdAt, expiresAt: record.expiresAt };
}

function isExpired(expiresAt: string | null, now: Date): boolean {
  return expiresAt !== null && Date.parse(expiresAt) <= now.getTime();
}

export class GrantStore {
  constructor(private readonly kv: KvNamespace, private readonly now: () => Date = () => new Date()) {}

  /** Creates an invitation and returns it with its code; the code cannot be recovered later. */
  async create(name: string, validDays: number | null): Promise<{ grant: AccessGrant; code: string }> {
    const now = this.now();
    let id = randomId();
    // 32^8 ids make a clash practically impossible, but a clash must never overwrite someone's invitation.
    while ((await this.kv.get(GRANT_PREFIX + id)) !== null) id = randomId();
    const secret = randomSecret();
    const expiresAt = validDays === null ? null : new Date(now.getTime() + validDays * 24 * 3600 * 1000).toISOString();
    const record: GrantRecord = { id, name, secretHash: await sha256Hex(secret), createdAt: now.toISOString(), expiresAt };
    await this.kv.put(GRANT_PREFIX + id, JSON.stringify(record), {
      metadata: publicFields(record),
      // KV deletes expired invitations by itself (a day later; the check below already refuses them).
      ...(expiresAt ? { expiration: Math.floor(Date.parse(expiresAt) / 1000) + 24 * 3600 } : {})
    });
    const index = await this.readIndex();
    await this.writeIndex([...index.filter((entry) => entry.id !== id), publicFields(record)]);
    return { grant: { ...publicFields(record), lastUsedAt: null }, code: `${id}.${secret}` };
  }

  /** The invitation a code belongs to, if the code is right and the invitation is neither revoked nor expired. */
  async verify(code: string): Promise<AccessGrant | null> {
    const parsed = parseCode(code);
    if (!parsed) return null;
    const raw = await this.kv.get(GRANT_PREFIX + parsed.id, { cacheTtl: GRANT_CACHE_SECONDS });
    if (raw === null) return null;
    let record: GrantRecord;
    try {
      record = JSON.parse(raw) as GrantRecord;
    } catch {
      return null;
    }
    if (!constantTimeEqual(await sha256Hex(parsed.secret), record.secretHash)) return null;
    if (isExpired(record.expiresAt, this.now())) return null;
    return { ...publicFields(record), lastUsedAt: null };
  }

  async markSeen(id: string): Promise<void> {
    const at = this.now().toISOString();
    await this.kv.put(SEEN_PREFIX + id, at, { metadata: { at }, expirationTtl: SEEN_TTL_SECONDS });
  }

  /** All invitations that still work, newest first. */
  async list(): Promise<AccessGrant[]> {
    const byId = new Map((await this.readIndex()).map((entry) => [entry.id, entry]));
    // Invitations from before the index existed: taken from list() once KV shows them, if they still exist.
    for (const key of await this.listKeys(GRANT_PREFIX)) {
      const meta = key.metadata as Omit<AccessGrant, 'lastUsedAt'> | undefined;
      if (!meta || typeof meta.id !== 'string' || byId.has(meta.id)) continue;
      if ((await this.kv.get(GRANT_PREFIX + meta.id)) !== null) byId.set(meta.id, meta);
    }
    const now = this.now();
    const grants = [...byId.values()].filter((entry) => !isExpired(entry.expiresAt, now));
    const seen = await Promise.all(grants.map((entry) => this.kv.get(SEEN_PREFIX + entry.id)));
    return grants
      .map((entry, i) => ({ ...entry, lastUsedAt: seen[i] }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Revokes an invitation. Returns false if there was none with this id. */
  async revoke(id: string): Promise<boolean> {
    if (!/^[a-z2-9]{8}$/.test(id)) return false;
    const index = await this.readIndex();
    const exists = index.some((entry) => entry.id === id) || (await this.kv.get(GRANT_PREFIX + id)) !== null;
    if (!exists) return false;
    await Promise.all([this.kv.delete(GRANT_PREFIX + id), this.kv.delete(SEEN_PREFIX + id)]);
    await this.writeIndex(index.filter((entry) => entry.id !== id));
    return true;
  }

  private async readIndex(): Promise<Omit<AccessGrant, 'lastUsedAt'>[]> {
    const raw = await this.kv.get(INDEX_KEY);
    if (raw === null) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as Omit<AccessGrant, 'lastUsedAt'>[]) : [];
    } catch {
      return [];
    }
  }

  private async writeIndex(entries: Omit<AccessGrant, 'lastUsedAt'>[]): Promise<void> {
    // Expired invitations leave the index whenever it is written.
    const now = this.now();
    await this.kv.put(INDEX_KEY, JSON.stringify(entries.filter((entry) => !isExpired(entry.expiresAt, now))));
  }

  private async listKeys(prefix: string) {
    const keys: { name: string; metadata?: unknown }[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.kv.list({ prefix, cursor });
      keys.push(...page.keys);
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    return keys;
  }
}

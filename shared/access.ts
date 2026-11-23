/**
 * Access by invitation: the types and limits shared by the Pages Functions and the UI.
 * No imports, so the backend (with .ts extensions) and the client (via @shared) can both use this file.
 */

/** Who is looking at the app. `enabled: false` means the site is open (no ADMIN_CODE configured). */
export interface AccessMe {
  enabled: boolean;
  role: 'admin' | 'guest' | null;
  /** The name the invitation was made for (guests only). */
  name?: string;
}

/** One invitation as the admin list shows it. The code itself is never stored, only its hash. */
export interface AccessGrant {
  id: string;
  name: string;
  createdAt: string;
  /** ISO timestamp; null means it does not expire. */
  expiresAt: string | null;
  /** ISO timestamp of the first use on the last day it was used; null if never used. */
  lastUsedAt: string | null;
}

export interface CreateGrantRequest {
  name: string;
  /** Days until the invitation stops working; null or missing means it does not expire. */
  validDays?: number | null;
}

/** The answer to creating an invitation: the only time the code and link can be seen. */
export interface CreatedGrant {
  grant: AccessGrant;
  code: string;
  link: string;
}

export const GRANT_NAME_MAX_LENGTH = 40;
export const GRANT_MAX_VALID_DAYS = 3650;

/** Path that turns an invitation code into a login: /join/<code>. */
export const JOIN_PATH = '/join';

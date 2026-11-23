import type { AccessGrant, AccessMe, CreateGrantRequest, CreatedGrant } from "@shared/access";

/** Client for /api/access: who is looking, and the admin's invitations. */

export class AccessApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body = (await response.json().catch(() => undefined)) as
    | { success: true; data: T }
    | { success: false; error: { code: string; message: string } }
    | undefined;
  if (body?.success) return body.data;
  const error = body && !body.success ? body.error : undefined;
  throw new AccessApiError(response.status, error?.code ?? `HTTP_${response.status}`, error?.message ?? response.statusText);
}

export const ACCESS_ME_KEY = ["access", "me"] as const;
export const ACCESS_GRANTS_KEY = ["access", "grants"] as const;

export function fetchAccessMe(): Promise<AccessMe> {
  return call<AccessMe>("/api/access/me");
}

export function fetchGrants(): Promise<AccessGrant[]> {
  return call<AccessGrant[]>("/api/access/grants");
}

export function createGrant(request: CreateGrantRequest): Promise<CreatedGrant> {
  return call<CreatedGrant>("/api/access/grants", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
}

export function revokeGrant(id: string): Promise<{ revoked: string }> {
  return call<{ revoked: string }>(`/api/access/grants/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** The invitation lapsed or was revoked while the app was open: go to the code page instead of showing errors. */
export function redirectToJoin(): void {
  if (typeof window !== "undefined") window.location.assign("/join");
}

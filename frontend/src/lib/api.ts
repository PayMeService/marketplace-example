/**
 * Thin fetch wrapper for this app's own API.
 *
 * Nothing here talks to PayMe directly, and that is the point: every PayMe call
 * runs on the server, where the partner key lives. The one exception in the
 * whole frontend is Hosted Fields, which talks to PayMe's vault from the
 * browser using the seller's *public* key — see lib/payme-hosted-fields.ts.
 */

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';
const TOKEN_KEY = 'marketplace.token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private browsing — the session just won't persist across reloads */
  }
}

/** Detail attached when the failure came from PayMe rather than from us. */
export interface PayMeErrorDetail {
  endpoint: string;
  /** PayMe's stable numeric error code (`status_error_code`). */
  errorCode: number | null;
  /** PayMe's own message (`status_error_details`). */
  details: string;
  /** Usually the offending field name (`status_additional_info`). */
  additionalInfo: unknown;
  /** PayMe's request session id — quote it to their support. */
  session: string | null;
}

/** An error from our API, carrying PayMe's own detail when there is one. */
export class ApiError extends Error {
  // Written out rather than declared as constructor parameter properties:
  // the frontend tsconfig sets `erasableSyntaxOnly`, which disallows them.
  readonly status: number;
  readonly payme?: PayMeErrorDetail;

  constructor(status: number, message: string, payme?: PayMeErrorDetail) {
    super(message);
    this.status = status;
    this.payme = payme;
  }
}

export async function api<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const { auth = true, headers, ...rest } = options;
  const token = auth ? getToken() : null;

  const response = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  // An empty body means "no value", NOT "empty object". Nest answers a
  // controller that returns null with `200 Content-Length: 0`, and coercing
  // that to {} makes every `if (result)` check downstream succeed on nothing —
  // which is how a "you already have a seller" panel ends up rendering for a
  // user who has no seller.
  if (response.status === 204) return null as T;

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = (body ?? {}) as {
      message?: string | string[];
      payme?: PayMeErrorDetail;
    };
    const message = Array.isArray(error.message)
      ? error.message.join(', ')
      : (error.message ?? `Request failed (${response.status})`);
    throw new ApiError(response.status, message, error.payme);
  }

  return body as T;
}

export const get = <T>(path: string) => api<T>(path);

export const post = <T>(path: string, body?: unknown, auth = true) =>
  api<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    auth,
  });

export const patch = <T>(path: string, body?: unknown) =>
  api<T>(path, {
    method: 'PATCH',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export const put = <T>(path: string, body?: unknown) =>
  api<T>(path, {
    method: 'PUT',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export const del = (path: string) => api<void>(path, { method: 'DELETE' });

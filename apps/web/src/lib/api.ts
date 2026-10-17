/** Thin fetch wrapper for the LIMS API (proxied same-origin under /api/v1). */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: { fields?: Record<string, string>; blockers?: string[] } & Record<string, unknown>,
  ) {
    super(message);
  }
  get fields(): Record<string, string> {
    return this.details?.fields ?? {};
  }
}

const BASE = '/api/v1';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const e = (data as { error?: { message?: string; code?: string; details?: ApiError['details'] } } | null)?.error;
    // A wrong password on re-entry (e-signature) is BAD_PASSWORD; only a dead session sends the user to sign in.
    if (res.status === 401 && e?.code !== 'BAD_PASSWORD' && typeof window !== 'undefined' && !path.startsWith('/auth/login') && !path.startsWith('/auth/me')) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?next=${next}`;
    }
    throw new ApiError(res.status, e?.message ?? `Request failed (${res.status})`, e?.code, e?.details);
  }
  return data as T;
}

function safeJson(t: string) {
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};

/** URL for a file/PDF the browser opens directly (cookie-authenticated). */
export const fileUrl = (path: string) => `${BASE}${path}`;

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : '';
}

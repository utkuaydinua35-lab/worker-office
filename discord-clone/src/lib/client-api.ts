/** fetch wrapper for the app's JSON API: returns the parsed body or throws with the server's message. */
export async function apiFetch<T = unknown>(input: string, init?: RequestInit): Promise<T> {
  const isJsonBody = typeof init?.body === 'string';
  const res = await fetch(input, {
    ...init,
    headers: isJsonBody ? { 'Content-Type': 'application/json', ...init?.headers } : init?.headers,
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `İstek başarısız (${res.status})`);
  return body as T;
}

export const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : 'Beklenmeyen bir hata oluştu';

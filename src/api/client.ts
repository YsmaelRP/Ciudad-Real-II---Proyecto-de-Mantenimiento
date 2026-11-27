export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timeout = window.setTimeout(abort, 10_000);
  const headers = new Headers(options.headers);
  if (options.body !== undefined && options.body !== null) headers.set('Content-Type', 'application/json');

  try {
    const response = await fetch(`/api${path}`, {
      ...options, headers, signal: controller.signal, credentials: 'include', cache: 'no-store',
    });
    if (response.status === 204) return undefined as T;
    const data: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const error = data && typeof data === 'object' && 'error' in data ? data.error : undefined;
      const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
        ? error.code : 'API_ERROR';
      const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
        ? error.message : 'No se pudo completar la operación. Comprueba que la API esté funcionando.';
      throw new ApiError(response.status, code, message);
    }
    if (data === undefined) throw new ApiError(response.status, 'INVALID_RESPONSE', 'La API devolvió una respuesta no válida.');
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, 'CONNECTION_ERROR', 'No se pudo conectar con la API. Comprueba que el backend esté funcionando e inténtalo de nuevo.');
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}

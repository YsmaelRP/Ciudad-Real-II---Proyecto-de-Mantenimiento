import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCategories, type Category } from './categories';

const categories: Category[] = [
  { id: '1', name: 'Plomería', description: null },
  { id: '3', name: 'Climatización', description: 'Aire acondicionado y ventilación.' },
];
const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('cliente API de categorías', () => {
  it('obtiene el catálogo con credenciales de sesión, sin guardarlas en el navegador', async () => {
    localStorage.clear();
    sessionStorage.clear();
    fetchMock.mockResolvedValue(json({ categories }));
    await expect(getCategories()).resolves.toEqual(categories);
    expect(fetchMock).toHaveBeenCalledWith('/api/categories', expect.objectContaining({
      credentials: 'include', cache: 'no-store',
    }));
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('acepta un catálogo vacío y conserva la descripción nula', async () => {
    fetchMock.mockResolvedValue(json({ categories: [] }));
    await expect(getCategories()).resolves.toEqual([]);
    fetchMock.mockResolvedValue(json({ categories: [{ id: '1', name: 'Plomería', description: null }] }));
    await expect(getCategories()).resolves.toEqual([{ id: '1', name: 'Plomería', description: null }]);
  });

  it('propaga la señal de cancelación al cliente HTTP', async () => {
    let internalSignal: AbortSignal | undefined;
    let resolveFetch!: (response: Response) => void;
    fetchMock.mockImplementation((_url, options) => {
      internalSignal = options?.signal ?? undefined;
      return new Promise<Response>((resolve) => { resolveFetch = resolve; });
    });
    const controller = new AbortController();
    const pending = getCategories(controller.signal);
    expect(internalSignal).toBeDefined();
    expect(internalSignal).not.toBe(controller.signal);
    expect(internalSignal?.aborted).toBe(false);
    controller.abort();
    expect(internalSignal?.aborted).toBe(true);
    resolveFetch(json({ categories }));
    await expect(pending).resolves.toEqual(categories);
  });

  it('rechaza respuestas con una estructura inválida', async () => {
    const invalidBodies = [
      null,
      {},
      { categories: null },
      { categories: {} },
      { categories: [{ id: 1, name: 'Plomería', description: null }] },
      { categories: [{ id: '1', name: 42, description: null }] },
      { categories: [{ id: '1', name: 'Plomería', description: 12 }] },
      { categories: [{ id: '1', name: 'Plomería' }] },
    ];
    for (const body of invalidBodies) {
      fetchMock.mockResolvedValue(json(body));
      await expect(getCategories()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    }
  });

  it('propaga los errores HTTP del servidor', async () => {
    for (const [status, code] of [[401, 'UNAUTHENTICATED'], [403, 'FORBIDDEN'], [503, 'CATALOG_UNAVAILABLE']] as const) {
      fetchMock.mockResolvedValue(json({ error: { code, message: 'Mensaje del servidor' } }, status));
      await expect(getCategories()).rejects.toMatchObject({ status, code, message: 'Mensaje del servidor' });
    }
  });

  it('convierte respuestas de error sin JSON en errores de la API', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Error de proxy</html>', { status: 502 }));
    await expect(getCategories()).rejects.toMatchObject({ status: 502, code: 'API_ERROR' });
  });

  it('convierte fallos de conexión en errores comprensibles', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(getCategories()).rejects.toMatchObject({ status: 0, code: 'CONNECTION_ERROR' });
  });
});

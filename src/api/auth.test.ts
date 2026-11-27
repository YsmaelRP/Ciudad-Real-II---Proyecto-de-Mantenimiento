import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSession, getTechnicians, login, logout } from './auth';
import { apiRequest } from './client';

const user = { id: '1', name: 'Residente Demo', email: 'residente@cr2.do', role: 'resident', initials: 'RD' };
const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('cliente HTTP de autenticación', () => {
  it('envía credenciales al servidor con cookies, sin guardarlas en el navegador', async () => {
    localStorage.clear();
    sessionStorage.clear();
    fetchMock.mockResolvedValue(json({ user }));
    await expect(login('residente@cr2.do', 'demo123')).resolves.toEqual(user);
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
      method: 'POST', credentials: 'include', cache: 'no-store',
      body: JSON.stringify({ email: 'residente@cr2.do', password: 'demo123' }),
    }));
    const options = fetchMock.mock.calls[0][1]!;
    expect(new Headers(options.headers).get('Content-Type')).toBe('application/json');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('restaura la sesión desde me, no desde una identidad local', async () => {
    fetchMock.mockResolvedValue(json({ user }));
    await expect(getSession()).resolves.toEqual(user);
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({ credentials: 'include' }));
  });

  it('propaga los errores de credenciales y el límite de intentos', async () => {
    for (const [status, code] of [[401, 'INVALID_CREDENTIALS'], [429, 'TOO_MANY_ATTEMPTS']] as const) {
      fetchMock.mockResolvedValue(json({ error: { code, message: 'Mensaje del servidor' } }, status));
      await expect(login('residente@cr2.do', 'incorrecta')).rejects.toMatchObject({ status, code, message: 'Mensaje del servidor' });
    }
  });

  it('maneja logout 204 sin intentar leer JSON', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(logout()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST', body: '{}' }));
  });

  it('rechaza respuestas inválidas sin crear identidades de respaldo', async () => {
    fetchMock.mockResolvedValue(json({ user: { ...user, role: 'inventado' } }));
    await expect(getSession()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    fetchMock.mockResolvedValue(new Response('<html>Error de proxy</html>', { status: 502 }));
    await expect(getSession()).rejects.toMatchObject({ status: 502, code: 'API_ERROR' });
  });

  it('convierte fallos de red en errores comprensibles', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(getSession()).rejects.toMatchObject({ status: 0, code: 'CONNECTION_ERROR' });
  });

  it('obtiene los técnicos de la API y valida el formato de respuesta', async () => {
    const technician = { ...user, id: '4', role: 'maintenance' };
    fetchMock.mockResolvedValue(json({ technicians: [technician] }));
    await expect(getTechnicians()).resolves.toEqual([technician]);
    expect(fetchMock).toHaveBeenCalledWith('/api/technicians', expect.objectContaining({ credentials: 'include' }));
    fetchMock.mockResolvedValue(json({ technicians: null }));
    await expect(getTechnicians()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('cancela peticiones que superen diez segundos', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const pending = expect(apiRequest('/auth/me')).rejects.toMatchObject({ code: 'CONNECTION_ERROR' });
    await vi.advanceTimersByTimeAsync(10_000);
    await pending;
  });
});

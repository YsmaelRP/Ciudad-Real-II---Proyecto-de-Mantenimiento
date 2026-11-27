import { apiRequest, ApiError } from './client';

export type Role = 'resident' | 'admin' | 'maintenance';
export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  initials: string;
};

function parseUser(value: unknown): AuthUser {
  if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string' ||
      !('name' in value) || typeof value.name !== 'string' ||
      !('email' in value) || typeof value.email !== 'string' ||
      !('initials' in value) || typeof value.initials !== 'string' ||
      !('role' in value) || !['resident', 'admin', 'maintenance'].includes(String(value.role))) {
    throw new ApiError(200, 'INVALID_RESPONSE', 'La API devolvió un usuario no válido.');
  }
  return { id: value.id, name: value.name, email: value.email, initials: value.initials, role: value.role as Role };
}

function userFromResponse(data: unknown): AuthUser {
  return parseUser(data && typeof data === 'object' && 'user' in data ? data.user : undefined);
}

export async function login(email: string, password: string): Promise<AuthUser> {
  return userFromResponse(await apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }));
}

export async function getSession(signal?: AbortSignal): Promise<AuthUser> {
  return userFromResponse(await apiRequest('/auth/me', { signal }));
}

export async function logout(): Promise<void> {
  await apiRequest<void>('/auth/logout', { method: 'POST', body: '{}' });
}

export async function getTechnicians(signal?: AbortSignal): Promise<AuthUser[]> {
  const data = await apiRequest<unknown>('/technicians', { signal });
  if (!data || typeof data !== 'object' || !('technicians' in data) || !Array.isArray(data.technicians)) {
    throw new ApiError(200, 'INVALID_RESPONSE', 'La API devolvió una lista de técnicos no válida.');
  }
  return data.technicians.map(parseUser);
}

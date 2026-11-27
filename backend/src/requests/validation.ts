import type { Request } from 'express';
import { RequestError } from './errors.js';
import type { NewRequestInput, RequestStatus } from './types.js';

export const STATUSES: readonly RequestStatus[] = ['Pendiente', 'En proceso', 'Resuelta'];

const MIN_DESCRIPTION = 15;
const MAX_DESCRIPTION = 500;
const MAX_WORK_DESCRIPTION = 2000;

function invalid(message: string): never {
  throw new RequestError(400, 'INVALID_INPUT', message);
}

export function bodyObject(req: Request): Record<string, unknown> {
  const body: unknown = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
  return body as Record<string, unknown>;
}

export function parsePositiveId(value: unknown, field: string): number {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) <= 0) {
    invalid(`Indica un ${field} válido.`);
  }
  return Number(text);
}

export function parseStatus(value: unknown): RequestStatus {
  if (typeof value !== 'string' || !STATUSES.includes(value as RequestStatus)) {
    invalid('Indica un estado válido: Pendiente, En proceso o Resuelta.');
  }
  return value as RequestStatus;
}

export function parseNewRequest(body: Record<string, unknown>): Omit<NewRequestInput, 'residentId'> {
  const categoryId = parsePositiveId(body.categoryId, 'identificador de categoría');
  const location = typeof body.location === 'string' ? body.location.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (!location || location.length > 150) invalid('Indica una ubicación de hasta 150 caracteres.');
  if (description.length < MIN_DESCRIPTION || description.length > MAX_DESCRIPTION) {
    invalid(`Describe el problema con entre ${MIN_DESCRIPTION} y ${MAX_DESCRIPTION} caracteres.`);
  }
  return { categoryId, location, description };
}

export function parseTechnicianId(body: Record<string, unknown>): number {
  return parsePositiveId(body.technicianId, 'identificador del trabajador');
}

// Solo se permiten avanzar un paso. La verificación definitiva se repite en la
// base de datos dentro de la transacción que bloquea la solicitud.
export function parseStatusChange(body: Record<string, unknown>): { status: RequestStatus; description?: string } {
  const status = parseStatus(body.status);
  if (status === 'Pendiente') invalid('El estado Pendiente no se puede asignar manualmente.');
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (status === 'Resuelta' && (description.length < MIN_DESCRIPTION || description.length > MAX_WORK_DESCRIPTION)) {
    invalid(`Describe el trabajo realizado con entre ${MIN_DESCRIPTION} y ${MAX_WORK_DESCRIPTION} caracteres.`);
  }
  return { status, description: description || undefined };
}

export function parseFilters(query: Request['query']): { search?: string; status?: RequestStatus } {
  const filters: { search?: string; status?: RequestStatus } = {};
  if (typeof query.status === 'string' && query.status !== 'Todas') filters.status = parseStatus(query.status);
  if (typeof query.search === 'string' && query.search.trim()) {
    const search = query.search.trim();
    if (search.length > 100) invalid('La búsqueda no puede superar los 100 caracteres.');
    filters.search = search;
  }
  return filters;
}

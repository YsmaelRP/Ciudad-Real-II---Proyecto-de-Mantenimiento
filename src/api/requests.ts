import { ApiError, apiRequest } from './client';

export type Status = 'Pendiente' | 'En proceso' | 'Resuelta';
export type HistoryType = 'created' | 'assignment' | 'status';

export type Category = { id: string; name: string };

export type HistoryEntry = {
  id: string;
  previousStatus: Status | null;
  newStatus: Status;
  userId: string;
  userName: string;
  at: string;
  note: string;
  type: HistoryType;
};

export type MaintenanceRequest = {
  id: string;
  code: string;
  residentId: string;
  residentName: string;
  category: string;
  location: string;
  description: string;
  status: Status;
  createdAt: string;
  assignedTo: string | null;
  assignedName: string | null;
  resolution: string | null;
  history: HistoryEntry[];
};

export type RequestFilters = { search?: string; status?: Status | 'Todas' };

const STATUSES: Status[] = ['Pendiente', 'En proceso', 'Resuelta'];
const HISTORY_TYPES: HistoryType[] = ['created', 'assignment', 'status'];

function invalid(message: string): never {
  throw new ApiError(200, 'INVALID_RESPONSE', message);
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`La API devolvió ${name} no válido.`);
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, name: string): string {
  if (typeof value !== 'string') invalid(`La API devolvió ${name} con ${field} no válido.`);
  return value;
}

function status(value: unknown, field: string, name: string): Status {
  const result = text(value, field, name);
  if (!STATUSES.includes(result as Status)) invalid(`La API devolvió ${name} con un estado desconocido.`);
  return result as Status;
}

function nullableText(value: unknown, field: string, name: string): string | null {
  return value === null ? null : text(value, field, name);
}

function parseHistoryEntry(value: unknown): HistoryEntry {
  const entry = object(value, 'una entrada del historial');
  const type = text(entry.type, 'type', 'una entrada del historial');
  if (!HISTORY_TYPES.includes(type as HistoryType)) invalid('La API devolvió un tipo de historial desconocido.');
  return {
    id: text(entry.id, 'id', 'una entrada del historial'),
    previousStatus: entry.previousStatus === null ? null : status(entry.previousStatus, 'previousStatus', 'una entrada del historial'),
    newStatus: status(entry.newStatus, 'newStatus', 'una entrada del historial'),
    userId: text(entry.userId, 'userId', 'una entrada del historial'),
    userName: text(entry.userName, 'userName', 'una entrada del historial'),
    at: text(entry.at, 'at', 'una entrada del historial'),
    note: text(entry.note, 'note', 'una entrada del historial'),
    type: type as HistoryType,
  };
}

export function parseRequest(value: unknown): MaintenanceRequest {
  const request = object(value, 'una solicitud');
  if (!Array.isArray(request.history)) invalid('La API devolvió una solicitud sin historial.');
  return {
    id: text(request.id, 'id', 'una solicitud'),
    code: text(request.code, 'code', 'una solicitud'),
    residentId: text(request.residentId, 'residentId', 'una solicitud'),
    residentName: text(request.residentName, 'residentName', 'una solicitud'),
    category: text(request.category, 'category', 'una solicitud'),
    location: text(request.location, 'location', 'una solicitud'),
    description: text(request.description, 'description', 'una solicitud'),
    status: status(request.status, 'status', 'una solicitud'),
    createdAt: text(request.createdAt, 'createdAt', 'una solicitud'),
    assignedTo: nullableText(request.assignedTo, 'assignedTo', 'una solicitud'),
    assignedName: nullableText(request.assignedName, 'assignedName', 'una solicitud'),
    resolution: nullableText(request.resolution, 'resolution', 'una solicitud'),
    history: request.history.map(parseHistoryEntry),
  };
}

function requestFromResponse(data: unknown): MaintenanceRequest {
  return parseRequest(object(data, 'una respuesta').request);
}

function listFromResponse(data: unknown): MaintenanceRequest[] {
  const response = object(data, 'una respuesta');
  if (!Array.isArray(response.requests)) invalid('La API devolvió un listado de solicitudes no válido.');
  return response.requests.map(parseRequest);
}

function queryOf(filters: RequestFilters): string {
  const params = new URLSearchParams();
  if (filters.search?.trim()) params.set('search', filters.search.trim());
  if (filters.status && filters.status !== 'Todas') params.set('status', filters.status);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export async function getCategories(signal?: AbortSignal): Promise<Category[]> {
  const data = await apiRequest<unknown>('/categories', { signal });
  const response = object(data, 'el catálogo');
  if (!Array.isArray(response.categories)) invalid('La API devolvió un catálogo no válido.');
  return response.categories.map((value) => {
    const category = object(value, 'una categoría');
    return { id: text(category.id, 'id', 'una categoría'), name: text(category.name, 'name', 'una categoría') };
  });
}

export async function listRequests(filters: RequestFilters = {}, signal?: AbortSignal): Promise<MaintenanceRequest[]> {
  return listFromResponse(await apiRequest<unknown>(`/requests${queryOf(filters)}`, { signal }));
}

export async function getRequest(id: string, signal?: AbortSignal): Promise<MaintenanceRequest> {
  return requestFromResponse(await apiRequest<unknown>(`/requests/${encodeURIComponent(id)}`, { signal }));
}

export async function createRequest(input: { categoryId: string; location: string; description: string }): Promise<MaintenanceRequest> {
  return requestFromResponse(await apiRequest<unknown>('/requests', {
    method: 'POST', body: JSON.stringify(input),
  }));
}

export async function assignRequest(id: string, technicianId: string): Promise<MaintenanceRequest> {
  return requestFromResponse(await apiRequest<unknown>(`/requests/${encodeURIComponent(id)}/assignment`, {
    method: 'PATCH', body: JSON.stringify({ technicianId }),
  }));
}

export async function changeStatus(id: string, next: Status, description?: string): Promise<MaintenanceRequest> {
  return requestFromResponse(await apiRequest<unknown>(`/requests/${encodeURIComponent(id)}/status`, {
    method: 'PATCH', body: JSON.stringify({ status: next, ...(description ? { description } : {}) }),
  }));
}

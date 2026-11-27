import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError, apiRequest } from './client';
import {
  assignRequest,
  changeStatus,
  createRequest,
  getRequest,
  listRequests,
  type MaintenanceRequest,
} from './requests';

vi.mock('./client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./client')>();
  return { ...actual, apiRequest: vi.fn() };
});

const record: MaintenanceRequest = {
  id: '7', code: 'CR2-7', residentId: '1', residentName: 'Residente Demo', category: 'Plomería',
  location: 'Torre B', description: 'Fuga de agua en la tubería del baño', status: 'Pendiente',
  createdAt: '2026-01-01T12:00:00.000Z', assignedTo: null, assignedName: null, resolution: null,
  history: [{
    id: 'h1', previousStatus: null, newStatus: 'Pendiente', userId: '1', userName: 'Residente Demo',
    at: '2026-01-01T12:00:00.000Z', note: 'Solicitud registrada', type: 'created',
  }],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(apiRequest).mockResolvedValue({ request: record } as never);
});

it('envía búsqueda y estado como parámetros de consulta', async () => {
  vi.mocked(apiRequest).mockResolvedValue({ requests: [record] } as never);
  expect(await listRequests({ search: 'Torre B', status: 'Pendiente' })).toEqual([record]);
  expect(apiRequest).toHaveBeenCalledWith('/requests?search=Torre+B&status=Pendiente', { signal: undefined });
  await listRequests({ status: 'Todas' });
  expect(apiRequest).toHaveBeenLastCalledWith('/requests', { signal: undefined });
});

it('publica el detalle y las operaciones de registro, asignación y estado', async () => {
  const signal = new AbortController().signal;
  expect(await getRequest('7', signal)).toEqual(record);
  expect(apiRequest).toHaveBeenCalledWith('/requests/7', { signal });

  expect(await createRequest({ categoryId: '2', location: 'Torre A', description: 'Descripción suficientemente larga' })).toEqual(record);
  expect(apiRequest).toHaveBeenLastCalledWith('/requests', {
    method: 'POST', body: JSON.stringify({ categoryId: '2', location: 'Torre A', description: 'Descripción suficientemente larga' }),
  });

  expect(await assignRequest('7', '4')).toEqual(record);
  expect(apiRequest).toHaveBeenLastCalledWith('/requests/7/assignment', {
    method: 'PATCH', body: JSON.stringify({ technicianId: '4' }),
  });

  expect(await changeStatus('7', 'Resuelta', 'Se cambió la tubería')).toEqual(record);
  expect(apiRequest).toHaveBeenLastCalledWith('/requests/7/status', {
    method: 'PATCH', body: JSON.stringify({ status: 'Resuelta', description: 'Se cambió la tubería' }),
  });
});

it('rechaza respuestas con datos incompletos en lugar de mostrarlos', async () => {
  vi.mocked(apiRequest).mockResolvedValue({ request: { ...record, history: undefined } } as never);
  await expect(getRequest('7')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  vi.mocked(apiRequest).mockResolvedValue({ requests: 'no es una lista' } as never);
  await expect(listRequests()).rejects.toBeInstanceOf(ApiError);
});

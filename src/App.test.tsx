import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import * as auth from './api/auth';
import { ApiError } from './api/client';
import * as requests from './api/requests';
import type { MaintenanceRequest } from './api/requests';

vi.mock('./api/auth', () => ({ getSession: vi.fn(), login: vi.fn(), logout: vi.fn(), getTechnicians: vi.fn() }));
vi.mock('./api/requests', () => ({
  getCategories: vi.fn(), listRequests: vi.fn(), getRequest: vi.fn(),
  createRequest: vi.fn(), assignRequest: vi.fn(), changeStatus: vi.fn(),
}));

const resident: auth.AuthUser = { id: '1', name: 'Residente Demo', email: 'residente@cr2.do', role: 'resident', initials: 'RD' };
const admin: auth.AuthUser = { id: '3', name: 'Administrador Demo', email: 'admin@cr2.do', role: 'admin', initials: 'AD' };
const technician: auth.AuthUser = { id: '4', name: 'Técnico Demo', email: 'mantenimiento@cr2.do', role: 'maintenance', initials: 'TD' };

function fixture(overrides: Partial<MaintenanceRequest> = {}): MaintenanceRequest {
  const at = new Date('2026-01-01T12:00:00.000Z').toISOString();
  return {
    id: '1', code: 'CR2-1', residentId: '1', residentName: 'Residente Demo', category: 'Plomería',
    location: 'Torre B · Apto 3C', description: 'Fuga de agua en la tubería del baño', status: 'Pendiente',
    createdAt: at, assignedTo: null, assignedName: null, resolution: null,
    history: [{ id: 'h1', previousStatus: null, newStatus: 'Pendiente', userId: '1', userName: 'Residente Demo', at, note: 'Solicitud registrada', type: 'created' }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  vi.mocked(auth.getSession).mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Debes iniciar sesión.'));
  vi.mocked(auth.login).mockResolvedValue(resident);
  vi.mocked(auth.logout).mockResolvedValue(undefined);
  vi.mocked(auth.getTechnicians).mockResolvedValue([]);
  vi.mocked(requests.getCategories).mockResolvedValue([{ id: '1', name: 'Plomería' }, { id: '2', name: 'Electricidad' }]);
  vi.mocked(requests.listRequests).mockResolvedValue([]);
  vi.mocked(requests.getRequest).mockResolvedValue(fixture());
  vi.mocked(requests.createRequest).mockResolvedValue(fixture());
  vi.mocked(requests.assignRequest).mockResolvedValue(fixture({ assignedTo: '4', assignedName: 'Técnico Demo' }));
  vi.mocked(requests.changeStatus).mockResolvedValue(fixture({ status: 'En proceso', assignedTo: '4', assignedName: 'Técnico Demo' }));
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

async function fillLogin() {
  const user = userEvent.setup();
  await screen.findByRole('button', { name: 'Iniciar sesión' });
  await user.type(screen.getByLabelText('Correo electrónico'), 'residente@cr2.do');
  await user.type(screen.getByLabelText('Contraseña'), 'demo123');
  return user;
}

it('espera la comprobación inicial y no confía en la sesión ficticia anterior', async () => {
  sessionStorage.setItem('cr2-maintenance-session', 'u-admin');
  render(<App />);
  expect(screen.getByRole('status')).toHaveTextContent('Comprobando sesión');
  await screen.findByRole('button', { name: 'Iniciar sesión' });
  expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument();
});

it('restaura el usuario desde la API al cargar la página', async () => {
  vi.mocked(auth.getSession).mockResolvedValue(resident);
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Hola, Residente' })).toBeInTheDocument();
  expect(screen.getByRole('note')).toHaveTextContent('Sesión y solicitudes conectadas a PostgreSQL');
  expect(auth.login).not.toHaveBeenCalled();
  await waitFor(() => expect(requests.listRequests).toHaveBeenCalled());
});

it('el formulario llama a la API y abre el panel del usuario devuelto', async () => {
  render(<App />);
  const user = await fillLogin();
  await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
  expect(await screen.findByRole('heading', { name: 'Hola, Residente' })).toBeInTheDocument();
  expect(auth.login).toHaveBeenCalledWith('residente@cr2.do', 'demo123');
  expect(sessionStorage.getItem('cr2-maintenance-session')).toBeNull();
});

it('muestra credenciales inválidas sin entrar al panel', async () => {
  vi.mocked(auth.login).mockRejectedValue(new ApiError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.'));
  render(<App />);
  const user = await fillLogin();
  await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos.');
  expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument();
});

it('bloquea el formulario mientras se envía el login', async () => {
  let finish!: (user: auth.AuthUser) => void;
  vi.mocked(auth.login).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  render(<App />);
  const user = await fillLogin();
  await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
  expect(screen.getByRole('button', { name: /Ingresando/ })).toBeDisabled();
  expect(screen.getByLabelText('Contraseña')).toBeDisabled();
  await act(async () => { finish(resident); });
  expect(await screen.findByRole('heading', { name: 'Hola, Residente' })).toBeInTheDocument();
});

it('permite reintentar la conexión inicial sin usar cuentas de respaldo', async () => {
  vi.mocked(auth.getSession).mockRejectedValueOnce(new ApiError(0, 'CONNECTION_ERROR', 'Sin conexión'));
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo comprobar la sesión');
  vi.mocked(auth.getSession).mockResolvedValue(resident);
  await userEvent.click(screen.getByRole('button', { name: 'Reintentar conexión' }));
  expect(await screen.findByRole('heading', { name: 'Hola, Residente' })).toBeInTheDocument();
});

it('logout llama al servidor y vuelve al formulario', async () => {
  vi.mocked(auth.getSession).mockResolvedValue(resident);
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
  await screen.findByRole('button', { name: 'Iniciar sesión' });
  expect(auth.logout).toHaveBeenCalledOnce();
});

it('no finge un cierre de sesión si el servidor falla', async () => {
  vi.mocked(auth.getSession).mockResolvedValue(resident);
  vi.mocked(auth.logout).mockRejectedValue(new ApiError(0, 'CONNECTION_ERROR', 'Sin conexión'));
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo confirmar el cierre de sesión');
  expect(screen.getByRole('heading', { name: 'Hola, Residente' })).toBeInTheDocument();
});

it('una sesión revocada vuelve al login al recuperar el foco', async () => {
  vi.mocked(auth.getSession).mockResolvedValueOnce(resident);
  render(<App />);
  await screen.findByRole('button', { name: 'Cerrar sesión' });
  act(() => { fireEvent(window, new Event('focus')); });
  expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument();
});

it('una respuesta de restauración antigua no recupera una sesión ya cerrada', async () => {
  vi.mocked(auth.getSession).mockResolvedValueOnce(resident);
  render(<App />);
  await screen.findByRole('button', { name: 'Cerrar sesión' });
  let finish!: (user: auth.AuthUser) => void;
  vi.mocked(auth.getSession).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  act(() => { fireEvent(window, new Event('focus')); });
  await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
  await screen.findByRole('button', { name: 'Iniciar sesión' });
  await act(async () => { finish(resident); });
  expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument();
});

it('carga las categorías desde la API y envía el ID real al registrar', async () => {
  vi.mocked(auth.getSession).mockResolvedValue(resident);
  render(<App />);
  await userEvent.click((await screen.findAllByRole('button', { name: 'Nueva solicitud' }))[0]);
  await userEvent.selectOptions(await screen.findByRole('combobox'), '1');
  await userEvent.type(screen.getByPlaceholderText(/Torre B/), 'Torre B · Apto 3C');
  await userEvent.type(screen.getByPlaceholderText(/Describe qué sucede/), 'Fuga de agua en la cocina del apartamento');
  await userEvent.click(screen.getByRole('button', { name: /Registrar solicitud/ }));
  await waitFor(() => expect(requests.createRequest).toHaveBeenCalledWith({
    categoryId: '1', location: 'Torre B · Apto 3C', description: 'Fuga de agua en la cocina del apartamento',
  }));
  expect(await screen.findByText('CR2-1')).toBeInTheDocument();
  expect(requests.getRequest).toHaveBeenCalledWith('1', expect.anything());
});

it('las búsquedas y los filtros se envían a la API autorizada', async () => {
  vi.mocked(auth.getSession).mockResolvedValue(admin);
  vi.mocked(requests.listRequests).mockResolvedValue([fixture()]);
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: 'Solicitudes' }));
  expect(await screen.findByRole('button', { name: 'Ver CR2-1' })).toBeInTheDocument();
  await userEvent.type(screen.getByPlaceholderText(/Buscar por código/), 'CR2-1');
  await userEvent.selectOptions(screen.getByRole('combobox'), 'Pendiente');
  await waitFor(() => expect(requests.listRequests).toHaveBeenCalledWith(
    expect.objectContaining({ search: 'CR2-1', status: 'Pendiente' }), expect.anything(),
  ));
});

it('la asignación se guarda en la API y conserva el estado', async () => {
  vi.mocked(auth.getSession).mockResolvedValue(admin);
  vi.mocked(requests.listRequests).mockResolvedValue([fixture()]);
  vi.mocked(auth.getTechnicians).mockResolvedValue([{ ...resident, id: '4', name: 'Técnico de API', role: 'maintenance' }]);
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: 'Solicitudes' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Ver CR2-1' }));
  await userEvent.selectOptions(await screen.findByRole('combobox'), '4');
  await userEvent.click(screen.getByRole('button', { name: 'Asignar solicitud' }));
  await waitFor(() => expect(requests.assignRequest).toHaveBeenCalledWith('1', '4'));
  expect(await screen.findByText(/El estado permanece Pendiente/)).toBeInTheDocument();
});

it('resolver envía la descripción del trabajo a la API', async () => {
  vi.mocked(auth.getSession).mockResolvedValue(technician);
  const assigned = fixture({ assignedTo: '4', assignedName: 'Técnico Demo', status: 'En proceso' });
  vi.mocked(requests.listRequests).mockResolvedValue([assigned]);
  vi.mocked(requests.getRequest).mockResolvedValue(assigned);
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: 'Ver CR2-1' }));
  await userEvent.type(await screen.findByPlaceholderText(/Detalla la reparación/), 'Se cambió la tubería y no hay fugas');
  await userEvent.click(screen.getByRole('button', { name: /Marcar como resuelta/ }));
  await waitFor(() => expect(requests.changeStatus).toHaveBeenCalledWith('1', 'Resuelta', 'Se cambió la tubería y no hay fugas'));
});

it('no usa almacenamiento local como fuente de solicitudes', async () => {
  vi.mocked(auth.getSession).mockResolvedValue(admin);
  const old = JSON.stringify([{ id: 'antiguo', residentId: 'u-res-1', code: 'CODIGO-ANTIGUO' }]);
  const local = JSON.stringify([fixture({ id: 'local-1', code: 'LOCAL-1' })]);
  localStorage.setItem('cr2-maintenance-beta-v1', old);
  localStorage.setItem('cr2-maintenance-local-requests-v2', local);
  render(<App />);
  await screen.findByRole('heading', { name: 'Hola, Administrador' });
  await waitFor(() => expect(requests.listRequests).toHaveBeenCalled());
  expect(screen.queryByText('CODIGO-ANTIGUO')).not.toBeInTheDocument();
  expect(screen.queryByText('LOCAL-1')).not.toBeInTheDocument();
  expect(localStorage.getItem('cr2-maintenance-beta-v1')).toBe(old);
  expect(localStorage.getItem('cr2-maintenance-local-requests-v2')).toBe(local);
});

it('un 401 al listar solicitudes invalida la sesión sin datos de respaldo', async () => {
  vi.mocked(auth.getSession).mockResolvedValue(resident);
  vi.mocked(requests.listRequests).mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Debes iniciar sesión.'));
  render(<App />);
  expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Tu sesión ya no es válida');
  expect(auth.getTechnicians).not.toHaveBeenCalled();
});

it('un 401 al cargar técnicos invalida la sesión sin usar una lista ficticia', async () => {
  vi.mocked(auth.getSession).mockResolvedValue(admin);
  vi.mocked(requests.listRequests).mockResolvedValue([fixture()]);
  vi.mocked(auth.getTechnicians).mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Debes iniciar sesión.'));
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: 'Ver CR2-1' }));
  expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Tu sesión ya no es válida');
});

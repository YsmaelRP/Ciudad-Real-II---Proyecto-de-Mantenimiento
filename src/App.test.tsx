import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import * as auth from './api/auth';
import { ApiError } from './api/client';

vi.mock('./api/auth', () => ({ getSession: vi.fn(), login: vi.fn(), logout: vi.fn(), getTechnicians: vi.fn() }));

const resident: auth.AuthUser = { id: '1', name: 'Residente Demo', email: 'residente@cr2.do', role: 'resident', initials: 'RD' };
const admin: auth.AuthUser = { id: '3', name: 'Administrador Demo', email: 'admin@cr2.do', role: 'admin', initials: 'AD' };

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  vi.mocked(auth.getSession).mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Debes iniciar sesión.'));
  vi.mocked(auth.login).mockResolvedValue(resident);
  vi.mocked(auth.logout).mockResolvedValue(undefined);
  vi.mocked(auth.getTechnicians).mockResolvedValue([]);
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
  expect(screen.getByRole('note')).toHaveTextContent('solicitudes todavía se guardan solo en este navegador');
  expect(auth.login).not.toHaveBeenCalled();
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

it('consulta los técnicos reales para la asignación aún local', async () => {
  vi.mocked(auth.getSession).mockResolvedValue(admin);
  vi.mocked(auth.getTechnicians).mockResolvedValue([{ ...resident, id: '4', name: 'Técnico de API', role: 'maintenance' }]);
  localStorage.setItem('cr2-maintenance-local-requests-v2', JSON.stringify([{
    id: 'local-1', code: 'LOCAL-1', residentId: '1', residentName: 'Residente Demo', category: 'Plomería',
    location: 'Ubicación ficticia', description: 'Descripción ficticia del problema.', status: 'Pendiente',
    createdAt: new Date().toISOString(), history: [],
  }]));
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: 'Ver LOCAL-1' }));
  expect(await screen.findByRole('option', { name: 'Técnico de API' })).toBeInTheDocument();
  expect(auth.getTechnicians).toHaveBeenCalledOnce();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Asignar solicitud' })).toBeEnabled());
});

it('no mezcla los casos ficticios anteriores ni borra sus datos guardados', async () => {
  vi.mocked(auth.getSession).mockResolvedValue(admin);
  const old = JSON.stringify([{ id: 'antiguo', residentId: 'u-res-1', code: 'CODIGO-ANTIGUO' }]);
  localStorage.setItem('cr2-maintenance-beta-v1', old);
  render(<App />);
  await screen.findByRole('heading', { name: 'Hola, Administrador' });
  expect(screen.queryByText('CODIGO-ANTIGUO')).not.toBeInTheDocument();
  expect(localStorage.getItem('cr2-maintenance-beta-v1')).toBe(old);
});

it('un 401 al cargar técnicos invalida la sesión sin usar una lista ficticia', async () => {
  vi.mocked(auth.getSession).mockResolvedValue(admin);
  vi.mocked(auth.getTechnicians).mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Debes iniciar sesión.'));
  localStorage.setItem('cr2-maintenance-local-requests-v2', JSON.stringify([{
    id: 'local-1', code: 'LOCAL-1', residentId: '1', residentName: 'Residente Demo', category: 'Plomería',
    location: 'Ubicación ficticia', description: 'Descripción ficticia del problema.', status: 'Pendiente',
    createdAt: new Date().toISOString(), history: [],
  }]));
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: 'Ver LOCAL-1' }));
  await screen.findByRole('button', { name: 'Iniciar sesión' });
  expect(screen.getByRole('alert')).toHaveTextContent('Tu sesión ya no es válida');
});

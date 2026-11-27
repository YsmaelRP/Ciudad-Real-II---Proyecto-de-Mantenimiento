import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashSync } from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import type { AuthRepository, LoginUser, SessionUser } from '../src/auth/types.js';
import { RequestError } from '../src/requests/errors.js';
import type {
  HistoryEntry,
  NewRequestInput,
  RequestFilters,
  RequestRecord,
  RequestRepository,
  RequestStatus,
} from '../src/requests/types.js';

const origin = 'http://localhost:8443';
const passwordHash = hashSync('demo123', 10);

const users: LoginUser[] = [
  { id: 1, name: 'Residente Demo', email: 'residente@cr2.do', role: 'residente', active: true, passwordHash },
  { id: 2, name: 'Otro Residente', email: 'carlos@cr2.do', role: 'residente', active: true, passwordHash },
  { id: 3, name: 'Administrador Demo', email: 'admin@cr2.do', role: 'administrador', active: true, passwordHash },
  { id: 4, name: 'Técnico Demo', email: 'mantenimiento@cr2.do', role: 'mantenimiento', active: true, passwordHash },
  { id: 5, name: 'Técnico Inactivo', email: 'inactivo@cr2.do', role: 'mantenimiento', active: false, passwordHash },
];

function publicOf(user: LoginUser): SessionUser {
  const { passwordHash: _hash, active: _active, ...publicUser } = user;
  return publicUser;
}

function setup() {
  const sessions = new Map<string, { userId: number; expiresAt: Date }>();
  const authRepository: AuthRepository = {
    async findUserByEmail(email) { return users.find((user) => user.email === email); },
    async createSession(userId, tokenHash, expiresAt, previousHash) {
      if (previousHash) sessions.delete(previousHash);
      if (!users.some((user) => user.id === userId && user.active)) return false;
      sessions.set(tokenHash, { userId, expiresAt });
      return true;
    },
    async findSession(tokenHash) {
      const session = sessions.get(tokenHash);
      if (!session || session.expiresAt.getTime() <= Date.now()) return undefined;
      const user = users.find((candidate) => candidate.id === session.userId);
      return user?.active ? publicOf(user) : undefined;
    },
    async deleteSession(tokenHash) { sessions.delete(tokenHash); },
    async listTechnicians() {
      return users.filter((user) => user.role === 'mantenimiento' && user.active).map(publicOf);
    },
  };

  const state = {
    requests: [] as RequestRecord[],
    nextId: 1,
    filters: [] as RequestFilters[],
    categories: [{ id: '1', name: 'Plomería' }, { id: '2', name: 'Electricidad' }],
  };

  const permitted = (user: SessionUser, record: RequestRecord) =>
    user.role === 'residente' ? record.residentId === String(user.id)
      : user.role === 'mantenimiento' ? record.assignedTo === String(user.id)
        : true;

  const history = (
    type: HistoryEntry['type'], note: string, previousStatus: RequestStatus | null,
    newStatus: RequestStatus, user: SessionUser,
  ): HistoryEntry => ({
    id: String(state.nextId * 100 + state.requests.length),
    previousStatus, newStatus, userId: String(user.id), userName: user.name,
    at: new Date().toISOString(), note, type,
  });

  const repository: RequestRepository = {
    async createRequest(input: NewRequestInput) {
      const resident = users.find((user) => user.id === input.residentId)!;
      const id = state.nextId++;
      const record: RequestRecord = {
        id: String(id), code: `CR2-${id}`, residentId: String(resident.id), residentName: resident.name,
        category: state.categories.find((category) => category.id === String(input.categoryId))?.name ?? 'Plomería',
        location: input.location, description: input.description, status: 'Pendiente',
        createdAt: new Date().toISOString(), assignedTo: null, assignedName: null, resolution: null,
        history: [history('created', 'Solicitud registrada', null, 'Pendiente', publicOf(resident))],
      };
      state.requests.push(record);
      return record;
    },
    async listRequests(user, filters) {
      state.filters.push(filters);
      return state.requests.filter((record) => permitted(user, record))
        .filter((record) => !filters.status || record.status === filters.status)
        .filter((record) => !filters.search ||
          `${record.code} ${record.category} ${record.location} ${record.residentName}`.toLowerCase().includes(filters.search.toLowerCase()));
    },
    async findRequest(user, id) {
      const record = state.requests.find((item) => item.id === String(id));
      return record && permitted(user, record) ? record : undefined;
    },
    async assignRequest(id, technicianId, administratorId) {
      const record = state.requests.find((item) => item.id === String(id));
      if (!record) throw new RequestError(404, 'NOT_FOUND', 'No existe.');
      if (record.status !== 'Pendiente') throw new RequestError(409, 'INVALID_STATE', 'Solo pendientes.');
      const technician = users.find((user) => user.id === technicianId && user.role === 'mantenimiento' && user.active);
      if (!technician) throw new RequestError(400, 'INVALID_TECHNICIAN', 'Trabajador no válido.');
      record.assignedTo = String(technician.id);
      record.assignedName = technician.name;
      record.history.push(history('assignment', `Asignada a ${technician.name}. El estado se conserva en ${record.status}.`,
        record.status, record.status, publicOf(users.find((user) => user.id === administratorId)!)));
      return record;
    },
    async changeStatus(id, user, next, description) {
      const record = state.requests.find((item) => item.id === String(id));
      if (!record || record.assignedTo !== String(user.id)) return undefined;
      const valid = (record.status === 'Pendiente' && next === 'En proceso') ||
        (record.status === 'En proceso' && next === 'Resuelta');
      if (!valid) throw new RequestError(409, 'INVALID_TRANSITION', 'Transición no permitida.');
      if (next === 'Resuelta' && (!description || description.length < 15)) {
        throw new RequestError(400, 'INVALID_INPUT', 'Falta la descripción del trabajo.');
      }
      const previous = record.status;
      record.status = next;
      if (next === 'Resuelta') record.resolution = description!;
      record.history.push(history('status', next === 'Resuelta' ? description! : 'Trabajo iniciado', previous, next, user));
      return record;
    },
  };

  const app = createApp({ frontendOrigin: origin, authRepository, requestRepository: repository });
  return { app, agent: request.agent(app), state, repository };
}

async function login(agent: request.Agent, email: string) {
  await agent.post('/api/auth/login').set('Origin', origin)
    .send({ email, password: 'demo123' }).expect(200);
}

async function createAsResident(agent: request.Agent) {
  const response = await agent.post('/api/requests').set('Origin', origin).send({
    categoryId: '1', location: 'Torre B · Apto 3C', description: 'Se rompió una tubería del baño',
  }).expect(201);
  return response.body.request as RequestRecord;
}

test('registrar solicitud toma el autor de la sesión, ignora el cuerpo y genera historial inicial', async () => {
  const { agent, state } = setup();
  await login(agent, 'residente@cr2.do');
  const response = await agent.post('/api/requests').set('Origin', origin).send({
    categoryId: '1', location: 'Torre B · Apto 3C', description: 'Se rompió una tubería del baño',
    residentId: '3', status: 'Resuelta', code: 'FALSIFICADO', createdAt: '2000-01-01',
  }).expect(201);
  const record = response.body.request as RequestRecord;
  assert.equal(record.code, 'CR2-1');
  assert.equal(record.residentId, '1');
  assert.equal(record.status, 'Pendiente');
  assert.deepEqual(record.history.map((item) => item.type), ['created']);
  assert.equal(record.history[0].previousStatus, null);
  assert.ok(!('passwordHash' in record));
  assert.equal(state.requests.length, 1);
  assert.ok(!JSON.stringify(response.body).includes('FALSIFICADO'));
});

test('solo residentes pueden registrar y los campos obligatorios se validan en el servidor', async () => {
  const { app, agent, state } = setup();
  await request(app).post('/api/requests').set('Origin', origin).send({}).expect(401);
  await login(agent, 'admin@cr2.do');
  await agent.post('/api/requests').set('Origin', origin).send({}).expect(403);
  await login(agent, 'mantenimiento@cr2.do');
  await agent.post('/api/requests').set('Origin', origin).send({}).expect(403);
  await login(agent, 'residente@cr2.do');
  const invalid = await agent.post('/api/requests').set('Origin', origin)
    .send({ categoryId: '1', location: '', description: 'corto' }).expect(400);
  assert.equal(invalid.body.error.code, 'INVALID_INPUT');
  await agent.post('/api/requests').set('Origin', origin)
    .send({ categoryId: '99', location: 'Torre A', description: 'Descripción suficientemente larga' }).expect(201);
  assert.equal(state.requests.length, 1);
});

test('las mutaciones rechazan un origen ajeno y un cuerpo que no sea JSON', async () => {
  const { agent } = setup();
  await login(agent, 'residente@cr2.do');
  const foreign = await agent.post('/api/requests').set('Origin', 'https://otro.example')
    .send({ categoryId: '1', location: 'Torre A', description: 'Descripción suficientemente larga' }).expect(403);
  assert.equal(foreign.body.error.code, 'UNTRUSTED_ORIGIN');
  await agent.post('/api/requests').set('Origin', origin).type('text/plain')
    .send('{"categoryId":"1"}').expect(415);
});

test('el listado aplica permisos por rol y reenvía búsqueda y filtro de estado', async () => {
  const { agent, state } = setup();
  await login(agent, 'residente@cr2.do');
  const own = await createAsResident(agent);
  await login(agent, 'carlos@cr2.do');
  await createAsResident(agent);
  await login(agent, 'admin@cr2.do');
  const adminList = await agent.get('/api/requests').expect(200);
  assert.equal(adminList.body.requests.length, 2);
  await login(agent, 'residente@cr2.do');
  const residentList = await agent.get('/api/requests').expect(200);
  assert.deepEqual(residentList.body.requests.map((item: RequestRecord) => item.id), [own.id]);
  const filtered = await agent.get('/api/requests?status=Pendiente&search=APTO%203C').expect(200);
  assert.deepEqual(filtered.body.requests.map((item: RequestRecord) => item.id), [own.id]);
  assert.deepEqual(state.filters.at(-1), { status: 'Pendiente', search: 'APTO 3C' });
  const invalidFilter = await agent.get('/api/requests?status=Inventado').expect(400);
  assert.equal(invalidFilter.body.error.code, 'INVALID_INPUT');
});

test('el detalle no revela casos ajenos a residentes ni a técnicos sin asignación', async () => {
  const { agent } = setup();
  await login(agent, 'residente@cr2.do');
  const record = await createAsResident(agent);
  await login(agent, 'carlos@cr2.do');
  const foreign = await agent.get(`/api/requests/${record.id}`).expect(404);
  assert.equal(foreign.body.error.code, 'NOT_FOUND');
  await login(agent, 'mantenimiento@cr2.do');
  await agent.get(`/api/requests/${record.id}`).expect(404);
  await login(agent, 'admin@cr2.do');
  const detail = await agent.get(`/api/requests/${record.id}`).expect(200);
  assert.equal(detail.body.request.id, record.id);
  await agent.get('/api/requests/no-numero').expect(400);
});

test('administración asigna o reasigna sin cambiar el estado y registra el evento', async () => {
  const { agent } = setup();
  await login(agent, 'residente@cr2.do');
  const record = await createAsResident(agent);
  await login(agent, 'residente@cr2.do');
  await agent.patch(`/api/requests/${record.id}/assignment`).set('Origin', origin)
    .send({ technicianId: '4' }).expect(403);
  await login(agent, 'admin@cr2.do');
  const assigned = await agent.patch(`/api/requests/${record.id}/assignment`).set('Origin', origin)
    .send({ technicianId: '4' }).expect(200);
  assert.equal(assigned.body.request.status, 'Pendiente');
  assert.equal(assigned.body.request.assignedTo, '4');
  assert.deepEqual(assigned.body.request.history.map((item: HistoryEntry) => item.type), ['created', 'assignment']);
  const reassigned = await agent.patch(`/api/requests/${record.id}/assignment`).set('Origin', origin)
    .send({ technicianId: '5' }).expect(400);
  assert.equal(reassigned.body.error.code, 'INVALID_TECHNICIAN');
  await agent.patch('/api/requests/999/assignment').set('Origin', origin)
    .send({ technicianId: '4' }).expect(404);
});

test('solo el técnico asignado avanza los estados y debe describir la resolución', async () => {
  const { agent } = setup();
  await login(agent, 'residente@cr2.do');
  const record = await createAsResident(agent);
  await login(agent, 'admin@cr2.do');
  await agent.patch(`/api/requests/${record.id}/assignment`).set('Origin', origin)
    .send({ technicianId: '4' }).expect(200);

  await login(agent, 'residente@cr2.do');
  await agent.patch(`/api/requests/${record.id}/status`).set('Origin', origin)
    .send({ status: 'En proceso' }).expect(403);
  await login(agent, 'mantenimiento@cr2.do');
  const started = await agent.patch(`/api/requests/${record.id}/status`).set('Origin', origin)
    .send({ status: 'En proceso' }).expect(200);
  assert.equal(started.body.request.status, 'En proceso');
  const skipped = await agent.patch(`/api/requests/${record.id}/status`).set('Origin', origin)
    .send({ status: 'Resuelta', description: 'Trabajo realizado correctamente' }).expect(200);
  assert.equal(skipped.body.request.status, 'Resuelta');
  assert.equal(skipped.body.request.resolution, 'Trabajo realizado correctamente');
  const backwards = await agent.patch(`/api/requests/${record.id}/status`).set('Origin', origin)
    .send({ status: 'En proceso' }).expect(409);
  assert.equal(backwards.body.error.code, 'INVALID_TRANSITION');
  assert.equal(skipped.body.request.history.length, 4);
});

test('rechaza saltos, retrocesos y descripción insuficiente al resolver', async () => {
  const { agent } = setup();
  await login(agent, 'residente@cr2.do');
  const record = await createAsResident(agent);
  await login(agent, 'admin@cr2.do');
  await agent.patch(`/api/requests/${record.id}/assignment`).set('Origin', origin)
    .send({ technicianId: '4' }).expect(200);
  await login(agent, 'mantenimiento@cr2.do');
  const jump = await agent.patch(`/api/requests/${record.id}/status`).set('Origin', origin)
    .send({ status: 'Resuelta', description: 'Trabajo realizado correctamente' }).expect(409);
  assert.equal(jump.body.error.code, 'INVALID_TRANSITION');
  const short = await agent.patch(`/api/requests/${record.id}/status`).set('Origin', origin)
    .send({ status: 'En proceso' }).expect(200);
  assert.equal(short.body.request.status, 'En proceso');
  const missing = await agent.patch(`/api/requests/${record.id}/status`).set('Origin', origin)
    .send({ status: 'Resuelta', description: 'arreglado' }).expect(400);
  assert.equal(missing.body.error.code, 'INVALID_INPUT');
  assert.equal(short.body.request.status, 'En proceso');
  const pending = await agent.patch(`/api/requests/${record.id}/status`).set('Origin', origin)
    .send({ status: 'Pendiente' }).expect(400);
  assert.equal(pending.body.error.code, 'INVALID_INPUT');
});

test('un técnico no puede modificar un caso que no tiene asignado', async () => {
  const { agent } = setup();
  await login(agent, 'residente@cr2.do');
  const record = await createAsResident(agent);
  await login(agent, 'mantenimiento@cr2.do');
  const response = await agent.patch(`/api/requests/${record.id}/status`).set('Origin', origin)
    .send({ status: 'En proceso' }).expect(404);
  assert.equal(response.body.error.code, 'NOT_FOUND');
});

test('sin repositorio de solicitudes las rutas responden 503 sin afectar health', async () => {
  const app = createApp({ frontendOrigin: origin });
  const catalog = await request(app).get('/api/categories').expect(503);
  assert.equal(catalog.body.error.code, 'AUTH_UNAVAILABLE');
  const unavailable = await request(app).get('/api/requests').expect(503);
  assert.equal(unavailable.body.error.code, 'REQUESTS_UNAVAILABLE');
  const health = await request(app).get('/api/health').expect(200);
  assert.deepEqual(health.body, { status: 'ok' });
});

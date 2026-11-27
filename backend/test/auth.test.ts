import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashSync } from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { hashToken } from '../src/auth/session.js';
import type { AuthRepository, LoginUser } from '../src/auth/types.js';

const passwordHash = hashSync('demo123', 10);
const origin = 'http://localhost:8443';

function setup(secureCookies = false) {
  const users: LoginUser[] = [
    { id: 1, name: 'Residente Demo', email: 'residente@cr2.do', role: 'residente', active: true, passwordHash },
    { id: 2, name: 'Administrador Demo', email: 'admin@cr2.do', role: 'administrador', active: true, passwordHash },
    { id: 3, name: 'Técnico Demo', email: 'mantenimiento@cr2.do', role: 'mantenimiento', active: true, passwordHash },
    { id: 4, name: 'Cuenta Inactiva', email: 'inactiva@cr2.do', role: 'mantenimiento', active: false, passwordHash },
  ];
  const sessions = new Map<string, { userId: number; expiresAt: Date }>();
  const repository: AuthRepository = {
    async findUserByEmail(email) { return users.find((user) => user.email === email); },
    async createSession(userId, tokenHash, expiresAt, previousHash) {
      if (previousHash) sessions.delete(previousHash);
      if (!users.some((user) => user.id === userId && user.active)) return false;
      sessions.set(tokenHash, { userId, expiresAt });
      return true;
    },
    async findSession(tokenHash) {
      const session = sessions.get(tokenHash);
      return session && session.expiresAt.getTime() > Date.now()
        ? users.find((user) => user.id === session.userId && user.active) : undefined;
    },
    async deleteSession(tokenHash) { sessions.delete(tokenHash); },
    async listTechnicians() { return users.filter((user) => user.role === 'mantenimiento' && user.active); },
  };
  const app = createApp({ frontendOrigin: origin, authRepository: repository, secureCookies });
  return { app, repository, users, sessions, agent: request.agent(app) };
}

function cookieOf(response: request.Response): string {
  const header = response.headers['set-cookie'];
  const cookies = Array.isArray(header) ? header : [header];
  const value = cookies.find((cookie) => typeof cookie === 'string' && cookie.startsWith('cr2_session='));
  assert.ok(value);
  return value.split(';')[0];
}

test('login acepta los tres roles y nunca expone hashes ni tokens en JSON', async () => {
  const { app, sessions } = setup();
  for (const [email, role] of [
    ['residente@cr2.do', 'resident'], ['admin@cr2.do', 'admin'], ['mantenimiento@cr2.do', 'maintenance'],
  ]) {
    const response = await request(app).post('/api/auth/login').set('Origin', origin)
      .send({ email, password: 'demo123' }).expect(200);
    assert.equal(response.body.user.role, role);
    assert.equal(response.body.user.email, email);
    assert.equal(typeof response.body.user.id, 'string');
    assert.deepEqual(Object.keys(response.body.user).sort(), ['email', 'id', 'initials', 'name', 'role']);
    assert.equal(response.headers['cache-control'], 'no-store');
    const cookie = cookieOf(response);
    const rawToken = cookie.split('=')[1];
    assert.match(rawToken, /^[0-9a-f]{64}$/);
    assert.ok(sessions.has(hashToken(rawToken)));
    assert.ok(!sessions.has(rawToken));
    const header = String(response.headers['set-cookie']);
    assert.match(header, /HttpOnly/);
    assert.match(header, /SameSite=Lax/);
    assert.match(header, /Path=\/api/);
    assert.match(header, /Max-Age=7200/);
  }
});

test('login normaliza el correo e ignora roles o identificadores enviados por el cliente', async () => {
  const { agent } = setup();
  const response = await agent.post('/api/auth/login')
    .send({ email: ' RESIDENTE@CR2.DO ', password: 'demo123', role: 'admin', id: '2' }).expect(200);
  assert.equal(response.body.user.role, 'resident');
  assert.equal(response.body.user.id, '1');
  await agent.get('/api/technicians').expect(403);
});

test('credenciales erróneas, cuentas inexistentes e inactivas tienen la misma respuesta', async () => {
  const { app, sessions } = setup();
  for (const [email, password] of [
    ['residente@cr2.do', 'incorrecta'], ['noexiste@cr2.do', 'demo123'], ['inactiva@cr2.do', 'demo123'],
  ]) {
    const response = await request(app).post('/api/auth/login').send({ email, password }).expect(401);
    assert.deepEqual(response.body, { error: { code: 'INVALID_CREDENTIALS', message: 'Correo o contraseña incorrectos.' } });
    assert.equal(response.headers['set-cookie'], undefined);
  }
  assert.equal(sessions.size, 0);
});

test('rechaza entradas inválidas y contraseñas que exceden los 72 bytes de bcrypt', async () => {
  const { app } = setup();
  for (const body of [{}, { email: 'no-correo', password: 'demo123' },
    { email: 'residente@cr2.do', password: 'x'.repeat(73) },
    { email: 'residente@cr2.do', password: 'á'.repeat(37) }]) {
    const response = await request(app).post('/api/auth/login').send(body).expect(400);
    assert.equal(response.body.error.code, 'INVALID_INPUT');
  }
  await request(app).post('/api/auth/login').type('form').send({ email: 'residente@cr2.do', password: 'demo123' }).expect(415);
});

test('me exige sesión válida y devuelve el usuario actual', async () => {
  const { app, agent } = setup();
  await request(app).get('/api/auth/me').expect(401);
  for (const cookie of ['cr2_session=inventada', `cr2_session=${'a'.repeat(64)}`, 'cr2_session=j%3A%7B%7D']) {
    await request(app).get('/api/auth/me').set('Cookie', cookie).expect(401);
  }
  await agent.post('/api/auth/login').send({ email: 'residente@cr2.do', password: 'demo123' }).expect(200);
  const response = await agent.get('/api/auth/me').expect(200);
  assert.equal(response.body.user.role, 'resident');
});

test('las sesiones expiradas o de usuarios desactivados se rechazan', async () => {
  const expired = setup();
  await expired.agent.post('/api/auth/login').send({ email: 'residente@cr2.do', password: 'demo123' }).expect(200);
  for (const session of expired.sessions.values()) session.expiresAt = new Date(0);
  await expired.agent.get('/api/auth/me').expect(401);

  const disabled = setup();
  await disabled.agent.post('/api/auth/login').send({ email: 'residente@cr2.do', password: 'demo123' }).expect(200);
  disabled.users[0].active = false;
  await disabled.agent.get('/api/auth/me').expect(401);
});

test('logout revoca la sesión en el servidor, no solo la cookie', async () => {
  const { app, agent, sessions } = setup();
  const login = await agent.post('/api/auth/login').send({ email: 'residente@cr2.do', password: 'demo123' }).expect(200);
  const oldCookie = cookieOf(login);
  await agent.post('/api/auth/logout').send({}).expect(204);
  assert.equal(sessions.size, 0);
  await request(app).get('/api/auth/me').set('Cookie', oldCookie).expect(401);
  await agent.get('/api/auth/me').expect(401);
  await agent.post('/api/auth/logout').send({}).expect(204);
});

test('un nuevo login rota el token y revoca la sesión anterior del navegador', async () => {
  const { app, agent, sessions } = setup();
  const first = await agent.post('/api/auth/login').send({ email: 'residente@cr2.do', password: 'demo123' }).expect(200);
  const second = await agent.post('/api/auth/login').send({ email: 'admin@cr2.do', password: 'demo123' }).expect(200);
  assert.notEqual(cookieOf(first), cookieOf(second));
  assert.equal(sessions.size, 1);
  await request(app).get('/api/auth/me').set('Cookie', cookieOf(first)).expect(401);
  const current = await agent.get('/api/auth/me').expect(200);
  assert.equal(current.body.user.role, 'admin');
});

test('solo administración puede listar técnicos activos', async () => {
  const { app } = setup();
  await request(app).get('/api/technicians').expect(401);
  for (const email of ['residente@cr2.do', 'mantenimiento@cr2.do']) {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email, password: 'demo123' }).expect(200);
    await agent.get('/api/technicians').expect(403);
  }
  const admin = request.agent(app);
  await admin.post('/api/auth/login').send({ email: 'admin@cr2.do', password: 'demo123' }).expect(200);
  const result = await admin.get('/api/technicians').expect(200);
  assert.equal(result.body.technicians.length, 1);
  assert.equal(result.body.technicians[0].role, 'maintenance');
  assert.equal(result.body.technicians[0].passwordHash, undefined);
});

test('bloquea orígenes ajenos y formularios cross-site sin invalidar la sesión', async () => {
  const { agent, app, sessions } = setup();
  await request(app).post('/api/auth/login').set('Origin', 'http://example.com')
    .send({ email: 'admin@cr2.do', password: 'demo123' }).expect(403);
  await request(app).post('/api/auth/login').set('Origin', 'null')
    .send({ email: 'admin@cr2.do', password: 'demo123' }).expect(403);
  await request(app).post('/api/auth/login').set('Sec-Fetch-Site', 'cross-site')
    .send({ email: 'admin@cr2.do', password: 'demo123' }).expect(403);
  await agent.post('/api/auth/login').send({ email: 'admin@cr2.do', password: 'demo123' }).expect(200);
  await agent.post('/api/auth/logout').set('Origin', 'http://example.com').send({}).expect(403);
  assert.equal(sessions.size, 1);
  await agent.get('/api/auth/me').expect(200);
});

test('limita los intentos de acceso por IP', async () => {
  const { app } = setup();
  for (let index = 0; index < 10; index++) {
    await request(app).post('/api/auth/login').send({ email: 'residente@cr2.do', password: 'incorrecta' }).expect(401);
  }
  const response = await request(app).post('/api/auth/login')
    .send({ email: 'residente@cr2.do', password: 'demo123' }).expect(429);
  assert.equal(response.body.error.code, 'TOO_MANY_ATTEMPTS');
});

test('configura Secure cuando se habilitan cookies de producción', async () => {
  const { app } = setup(true);
  const response = await request(app).post('/api/auth/login')
    .send({ email: 'residente@cr2.do', password: 'demo123' }).expect(200);
  assert.match(String(response.headers['set-cookie']), /; Secure/);
});

test('los fallos de base de datos no exponen detalles ni crean cookies', async () => {
  const { app, repository } = setup();
  repository.createSession = async () => { throw new Error('postgresql://usuario:secreto@servidor/base'); };
  const response = await request(app).post('/api/auth/login')
    .send({ email: 'residente@cr2.do', password: 'demo123' }).expect(500);
  assert.deepEqual(response.body, { error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor.' } });
  assert.equal(response.headers['set-cookie'], undefined);
});

test('sin base configurada las rutas de autenticación responden 503', async () => {
  const app = createApp({ frontendOrigin: origin });
  await request(app).post('/api/auth/login').send({ email: 'residente@cr2.do', password: 'demo123' }).expect(503);
  await request(app).get('/api/auth/me').expect(503);
  await request(app).get('/api/health').expect(200);
});

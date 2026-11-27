import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { hashToken } from '../src/auth/session.js';
import type { AuthRepository, SessionUser } from '../src/auth/types.js';
import type { Category, CategoryRepository } from '../src/categories/types.js';

const origin = 'http://localhost:8443';
const rawToken = 'a'.repeat(64);
const cookie = `cr2_session=${rawToken}`;
const validHash = hashToken(rawToken);

const active: Category[] = [
  { id: '3', name: 'Climatización', description: 'Aire acondicionado y ventilación.' },
  { id: '1', name: 'Plomería', description: null },
];

function setup(options: {
  role?: SessionUser['role'];
  categoryRepository?: CategoryRepository;
  withCatalog?: boolean;
} = {}) {
  let calls = 0;
  const user: SessionUser = {
    id: 1,
    name: 'Usuario Demo',
    email: 'residente@cr2.do',
    role: options.role ?? 'residente',
  };
  const authRepository: AuthRepository = {
    async findUserByEmail() { return undefined; },
    async createSession() { return false; },
    async findSession(tokenHash) { return tokenHash === validHash ? user : undefined; },
    async deleteSession() {},
    async listTechnicians() { return []; },
  };
  const categoryRepository = options.categoryRepository ??
    (options.withCatalog === false ? undefined : {
      async listActive() {
        calls++;
        return active;
      },
    });
  const app = createApp({ frontendOrigin: origin, authRepository, categoryRepository });
  return { app, calls: () => calls };
}

test('categories exige una sesión válida y no expone el catálogo', async () => {
  const { app, calls } = setup();
  for (const value of [undefined, 'inventada', 'b'.repeat(64)]) {
    const pending = request(app).get('/api/categories');
    if (value) pending.set('Cookie', `cr2_session=${value}`);
    const response = await pending.expect(401);
    assert.equal(response.body.error.code, 'UNAUTHENTICATED');
    assert.equal(response.body.categories, undefined);
    assert.equal(response.headers['cache-control'], 'no-store');
  }
  assert.equal(calls(), 0);
});

test('cualquier rol autenticado obtiene las categorías activas con IDs como texto', async () => {
  for (const role of ['residente', 'administrador', 'mantenimiento'] as const) {
    const { app, calls } = setup({ role });
    const response = await request(app).get('/api/categories').set('Cookie', cookie).expect(200);
    assert.deepEqual(response.body, { categories: active });
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(typeof response.body.categories[0].id, 'string');
    assert.deepEqual(Object.keys(response.body.categories[0]).sort(), ['description', 'id', 'name']);
    assert.equal(calls(), 1);
  }
});

test('sin repositorio de categorías responde 503 sin consultar la base', async () => {
  const { app, calls } = setup({ withCatalog: false });
  const response = await request(app).get('/api/categories').set('Cookie', cookie).expect(503);
  assert.deepEqual(response.body, {
    error: { code: 'CATALOG_UNAVAILABLE', message: 'El catálogo de categorías no está configurado.' },
  });
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(calls(), 0);
});

test('sin servicio de acceso responde 503 antes de consultar el catálogo', async () => {
  let calls = 0;
  const categoryRepository: CategoryRepository = {
    async listActive() {
      calls++;
      return active;
    },
  };
  const app = createApp({ frontendOrigin: origin, categoryRepository });
  const response = await request(app).get('/api/categories').set('Cookie', cookie).expect(503);
  assert.equal(response.body.error.code, 'AUTH_UNAVAILABLE');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(calls, 0);
});

test('un fallo del repositorio devuelve 500 sin filtrar detalles de conexión', async () => {
  const { app } = setup({
    categoryRepository: {
      async listActive() { throw new Error('postgresql://usuario:secreto@servidor/base'); },
    },
  });
  const response = await request(app).get('/api/categories').set('Cookie', cookie).expect(500);
  assert.deepEqual(response.body, {
    error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor.' },
  });
  assert.ok(!JSON.stringify(response.body).includes('secreto'));
});

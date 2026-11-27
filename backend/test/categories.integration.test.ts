import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createAuthRepository } from '../src/auth/repository.js';
import { hashToken } from '../src/auth/session.js';
import { createCategoryRepository } from '../src/categories/repository.js';
import { createDatabase } from '../src/database.js';

// Reutiliza la base de prueba completa del seed. Solo lectura: no modifica
// cuentas ni categorías y elimina únicamente la sesión creada por esta prueba.
const url = process.env.TEST_AUTH_DATABASE_URL;

test('categories consulta el catálogo activo de PostgreSQL con sesión válida', { skip: !url }, async () => {
  const database = createDatabase(url!);
  const authRepository = createAuthRepository(database.pool);
  let sessionHash: string | undefined;

  try {
    const app = createApp({
      frontendOrigin: 'http://localhost:8443',
      authRepository,
      categoryRepository: createCategoryRepository(database.pool),
    });

    await request(app).get('/api/categories').expect(401);

    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login')
      .send({ email: 'residente@cr2.do', password: 'demo123' }).expect(200);
    assert.equal(login.body.user.role, 'resident');
    const header = login.headers['set-cookie'];
    const cookie = (Array.isArray(header) ? header : [header])
      .find((value) => typeof value === 'string' && value.startsWith('cr2_session='));
    assert.ok(cookie);
    sessionHash = hashToken(String(cookie).split(';')[0].split('=')[1]);

    const response = await agent.get('/api/categories').expect(200);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.ok(Array.isArray(response.body.categories));

    const active = await database.pool.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM categorias WHERE activa = TRUE',
    );
    assert.equal(response.body.categories.length, active.rows[0].count);

    const names = response.body.categories.map((category: { name: string }) => category.name);
    for (const expected of ['Plomería', 'Electricidad', 'Climatización', 'Carpintería', 'Otros']) {
      assert.ok(names.includes(expected), `Falta la categoría ${expected}`);
    }
    for (const category of response.body.categories) {
      assert.match(category.id, /^\d+$/);
      assert.deepEqual(Object.keys(category).sort(), ['description', 'id', 'name']);
      assert.ok(category.description === null || typeof category.description === 'string');
    }
  } finally {
    try {
      if (sessionHash) await authRepository.deleteSession(sessionHash);
    } finally {
      await database.close();
    }
  }
});

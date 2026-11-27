import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createAuthRepository } from '../src/auth/repository.js';
import { hashToken } from '../src/auth/session.js';
import { createDatabase } from '../src/database.js';

// Habilitar solo contra una base de prueba con migraciones 001-004 y seed_demo.
// No se carga .env ni se ejecutan migraciones automáticamente.
const url = process.env.TEST_AUTH_DATABASE_URL;

test('autenticación y permisos con PostgreSQL real', { skip: !url }, async () => {
  const database = createDatabase(url!);
  const repository = createAuthRepository(database.pool);
  const app = createApp({ frontendOrigin: 'http://localhost:8443', authRepository: repository });
  const hashes = new Set<string>();

  function trackCookie(response: request.Response) {
    const header = response.headers['set-cookie'];
    const values = Array.isArray(header) ? header : [header];
    const cookie = values.find((value) => typeof value === 'string' && value.startsWith('cr2_session='))?.split(';')[0];
    assert.ok(cookie);
    const raw = cookie.split('=')[1];
    hashes.add(hashToken(raw));
    return { cookie, raw, hash: hashToken(raw) };
  }

  try {
    await request(app).get('/api/auth/me').expect(401);

    const resident = request.agent(app);
    const residentLogin = await resident.post('/api/auth/login')
      .send({ email: 'residente@cr2.do', password: 'demo123' }).expect(200);
    const first = trackCookie(residentLogin);
    assert.equal(residentLogin.body.user.role, 'resident');
    const me = await resident.get('/api/auth/me').expect(200);
    assert.equal(me.body.user.email, 'residente@cr2.do');
    await resident.get('/api/technicians').expect(403);

    const stored = await database.pool.query(
      'SELECT token_hash, fecha_expiracion FROM sesiones WHERE token_hash = $1', [first.hash],
    );
    assert.equal(stored.rowCount, 1);
    assert.equal(stored.rows[0].token_hash, first.hash);
    assert.notEqual(stored.rows[0].token_hash, first.raw);
    assert.ok(stored.rows[0].fecha_expiracion.getTime() > Date.now());

    const admin = request.agent(app);
    const adminLogin = await admin.post('/api/auth/login')
      .send({ email: 'admin@cr2.do', password: 'demo123' }).expect(200);
    const adminSession = trackCookie(adminLogin);
    const technicians = await admin.get('/api/technicians').expect(200);
    assert.equal(technicians.body.technicians.length, 2);
    assert.ok(technicians.body.technicians.every((user: { role: string }) => user.role === 'maintenance'));

    const technician = request.agent(app);
    const techLogin = await technician.post('/api/auth/login')
      .send({ email: 'mantenimiento@cr2.do', password: 'demo123' }).expect(200);
    trackCookie(techLogin);
    assert.equal(techLogin.body.user.role, 'maintenance');
    await technician.get('/api/technicians').expect(403);

    await request(app).post('/api/auth/login')
      .send({ email: 'residente@cr2.do', password: 'incorrecta' }).expect(401);

    const rotatedLogin = await resident.post('/api/auth/login')
      .send({ email: 'residente@cr2.do', password: 'demo123' }).expect(200);
    const rotated = trackCookie(rotatedLogin);
    assert.notEqual(first.hash, rotated.hash);
    assert.equal(await repository.findSession(first.hash), undefined);
    await request(app).get('/api/auth/me').set('Cookie', first.cookie).expect(401);

    await admin.post('/api/auth/logout').send({}).expect(204);
    assert.equal(await repository.findSession(adminSession.hash), undefined);
    await request(app).get('/api/auth/me').set('Cookie', adminSession.cookie).expect(401);

    // Solo modificar la sesión creada por esta prueba, nunca cuentas existentes.
    await database.pool.query(
      `UPDATE sesiones SET fecha_creacion = CURRENT_TIMESTAMP - INTERVAL '3 hours',
                           fecha_expiracion = CURRENT_TIMESTAMP - INTERVAL '1 hour'
       WHERE token_hash = $1`, [rotated.hash],
    );
    await resident.get('/api/auth/me').expect(401);
  } finally {
    try {
      for (const hash of hashes) await repository.deleteSession(hash);
    } finally {
      await database.close();
    }
  }
});

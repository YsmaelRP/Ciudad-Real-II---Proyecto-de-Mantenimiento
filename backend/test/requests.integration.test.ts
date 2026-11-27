import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createAuthRepository } from '../src/auth/repository.js';
import { hashToken } from '../src/auth/session.js';
import { createDatabase } from '../src/database.js';
import { createRequestRepository } from '../src/requests/repository.js';
import type { RequestRecord } from '../src/requests/types.js';

const url = process.env.TEST_REQUESTS_DATABASE_URL;
const origin = 'http://localhost:8443';
const password = 'demo123';

test('flujo completo de solicitudes contra PostgreSQL real', { skip: !url }, async () => {
  assert.ok(url);
  const database = createDatabase(url);
  const sessionHashes: string[] = [];
  let requestId: number | undefined;

  try {
    const app = createApp({
      frontendOrigin: origin,
      checkDatabase: database.checkConnection,
      authRepository: createAuthRepository(database.pool),
      requestRepository: createRequestRepository(database.pool),
    });
    const resident = request.agent(app);
    const otherResident = request.agent(app);
    const admin = request.agent(app);
    const technician = request.agent(app);

    const signIn = async (agent: request.Agent, email: string) => {
      const response = await agent.post('/api/auth/login').set('Origin', origin)
        .send({ email, password }).expect(200);
      const cookie = response.headers['set-cookie'];
      const cookies = Array.isArray(cookie) ? cookie : [cookie];
      const raw = cookies.find((value) => typeof value === 'string' && value.startsWith('cr2_session='));
      assert.ok(raw);
      const token = String(raw).split(';')[0].split('=')[1];
      sessionHashes.push(hashToken(token));
      return response;
    };

    await request(app).get('/api/ready').expect(200);
    await signIn(resident, 'residente@cr2.do');
    await signIn(otherResident, 'carlos@cr2.do');
    await signIn(admin, 'admin@cr2.do');
    const technicianLogin = await signIn(technician, 'mantenimiento@cr2.do');
    const technicianId = technicianLogin.body.user.id as string;

    const categories = await resident.get('/api/categories').expect(200);
    assert.ok(categories.body.categories.some((category: { name: string }) => category.name === 'Plomería'));
    const plumbing = categories.body.categories.find((category: { name: string }) => category.name === 'Plomería');

    const created = await resident.post('/api/requests').set('Origin', origin).send({
      categoryId: String(plumbing.id), location: 'Torre B · Apto 3C',
      description: 'Fuga de agua en la tubería del baño principal',
    }).expect(201);
    const record = created.body.request as RequestRecord;
    assert.match(record.code, /^CR2-\d+$/);
    assert.equal(record.status, 'Pendiente');
    assert.deepEqual(record.history.map((entry) => entry.type), ['created']);
    requestId = Number(record.id);

    const own = await resident.get('/api/requests').expect(200);
    assert.ok(own.body.requests.some((item: RequestRecord) => item.id === record.id));
    await otherResident.get(`/api/requests/${record.id}`).expect(404);
    await technician.get(`/api/requests/${record.id}`).expect(404);

    const assigned = await admin.patch(`/api/requests/${record.id}/assignment`).set('Origin', origin)
      .send({ technicianId }).expect(200);
    assert.equal(assigned.body.request.status, 'Pendiente');
    assert.equal(assigned.body.request.assignedTo, technicianId);
    assert.deepEqual(assigned.body.request.history.map((entry: { type: string }) => entry.type), ['created', 'assignment']);

    await technician.get(`/api/requests/${record.id}`).expect(200);
    const started = await technician.patch(`/api/requests/${record.id}/status`).set('Origin', origin)
      .send({ status: 'En proceso' }).expect(200);
    assert.equal(started.body.request.status, 'En proceso');
    await technician.patch(`/api/requests/${record.id}/status`).set('Origin', origin)
      .send({ status: 'Resuelta', description: 'corto' }).expect(400);
    const resolved = await technician.patch(`/api/requests/${record.id}/status`).set('Origin', origin)
      .send({ status: 'Resuelta', description: 'Se cambió la tubería y se comprobó que no hay fugas' }).expect(200);
    assert.equal(resolved.body.request.status, 'Resuelta');
    assert.equal(resolved.body.request.resolution, 'Se cambió la tubería y se comprobó que no hay fugas');
    assert.equal(resolved.body.request.history.length, 4);

    const stored = await database.pool.query<{ estado: string; eventos: number; observacion: string | null }>(
      `SELECT s.estado,
              (SELECT COUNT(*)::int FROM historial_estados h WHERE h.id_solicitud = s.id_solicitud) AS eventos,
              (SELECT h.observacion FROM historial_estados h
                WHERE h.id_solicitud = s.id_solicitud AND h.estado_nuevo = 'Resuelta'
                ORDER BY h.id_historial DESC LIMIT 1) AS observacion
         FROM solicitudes s WHERE s.id_solicitud = $1`, [record.id],
    );
    assert.equal(stored.rows[0].estado, 'Resuelta');
    assert.equal(stored.rows[0].eventos, 4);
    assert.equal(stored.rows[0].observacion, resolved.body.request.resolution);

    const visible = await resident.get(`/api/requests/${record.id}`).expect(200);
    assert.equal(visible.body.request.status, 'Resuelta');
    const filtered = await admin.get('/api/requests?status=Resuelta&search=CR2-').expect(200);
    assert.ok(filtered.body.requests.some((item: RequestRecord) => item.id === record.id));
  } finally {
    if (requestId !== undefined) {
      await database.pool.query('DELETE FROM historial_estados WHERE id_solicitud = $1', [requestId]);
      await database.pool.query('DELETE FROM asignaciones WHERE id_solicitud = $1', [requestId]);
      await database.pool.query('DELETE FROM solicitudes WHERE id_solicitud = $1', [requestId]);
    }
    for (const hash of sessionHashes) {
      await database.pool.query('DELETE FROM sesiones WHERE token_hash = $1', [hash]);
    }
    await database.close();
  }
});

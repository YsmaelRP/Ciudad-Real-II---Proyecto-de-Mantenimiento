import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';

const origin = 'http://localhost:8443';
const app = createApp({ frontendOrigin: origin });

test('health confirma que Express funciona', async () => {
  const response = await request(app).get('/api/health').expect(200);
  assert.deepEqual(response.body, { status: 'ok' });
  assert.equal(response.headers['x-powered-by'], undefined);
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
});

test('las rutas desconocidas devuelven un error JSON', async () => {
  const response = await request(app).get('/api/no-existe').expect(404);
  assert.equal(response.body.error.code, 'NOT_FOUND');
});

test('rechaza JSON mal formado sin exponer detalles internos', async () => {
  const response = await request(app).post('/api/no-existe')
    .set('Content-Type', 'application/json').send('{').expect(400);
  assert.deepEqual(response.body, {
    error: { code: 'INVALID_JSON', message: 'El cuerpo JSON no es válido.' },
  });
});

test('limita el tamaño del cuerpo', async () => {
  const response = await request(app).post('/api/no-existe')
    .send({ text: 'x'.repeat(33 * 1024) }).expect(413);
  assert.equal(response.body.error.code, 'BODY_TOO_LARGE');
});

test('CORS autoriza solo el origen configurado para el navegador', async () => {
  const allowed = await request(app).get('/api/health').set('Origin', origin).expect(200);
  assert.equal(allowed.headers['access-control-allow-origin'], origin);
  const other = await request(app).get('/api/health').set('Origin', 'http://example.com').expect(200);
  assert.notEqual(other.headers['access-control-allow-origin'], 'http://example.com');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/database.js';

// No carga .env ni toca tablas. Usar una base de prueba y habilitar explícitamente.
const url = process.env.TEST_DATABASE_URL;

test('ready ejecuta SELECT 1 contra PostgreSQL real', { skip: !url }, async () => {
  const database = createDatabase(url!);
  try {
    const app = createApp({ frontendOrigin: 'http://localhost:8443', checkDatabase: database.checkConnection });
    const response = await request(app).get('/api/ready').expect(200);
    assert.deepEqual(response.body, { status: 'ready' });
  } finally {
    await database.close();
  }
});

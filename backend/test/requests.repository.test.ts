import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pool } from 'pg';
import type { SessionUser } from '../src/auth/types.js';
import { createRequestRepository } from '../src/requests/repository.js';

const technician: SessionUser = { id: 4, name: 'Técnico Demo', email: 'mantenimiento@cr2.do', role: 'mantenimiento' };

const requestRow = {
  id: 7,
  code: 'CR2-7',
  residentId: 1,
  residentName: 'Residente Demo',
  category: 'Plomería',
  location: 'Torre B',
  description: 'Descripción suficientemente larga',
  status: 'Pendiente',
  createdAt: new Date('2026-01-01T12:00:00Z'),
  assignedTo: 4,
  assignedName: technician.name,
  resolution: null,
};

// Pool falso: comprueba el orden de las sentencias de la transacción sin PostgreSQL.
function fakePool(failOn: 'history' | 'status-history' | null) {
  const events: string[] = [];
  const client = {
    async query(sql: string) {
      const query = sql.replace(/\s+/g, ' ').trim();
      events.push(query.slice(0, 48));
      if (query.startsWith('BEGIN')) return { rows: [], rowCount: 0 };
      if (query.startsWith('SELECT 1 FROM categorias')) return { rows: [{}], rowCount: 1 };
      if (query.startsWith('INSERT INTO solicitudes')) return { rows: [{ id: 7 }], rowCount: 1 };
      if (query.startsWith('SELECT id_solicitud AS id, estado AS status FROM solicitudes')) {
        return { rows: [{ id: 7, status: 'Pendiente' }], rowCount: 1 };
      }
      if (query.startsWith('SELECT s.id_solicitud AS id, s.estado AS status')) {
        return { rows: [{ id: 7, status: 'Pendiente', assignedTo: 4 }], rowCount: 1 };
      }
      if (query.startsWith('SELECT nombre AS name FROM usuarios')) {
        return { rows: [{ name: technician.name }], rowCount: 1 };
      }
      if (query.startsWith('INSERT INTO historial_estados')) {
        if (failOn === 'history' || failOn === 'status-history') throw new Error('fallo deliberado en historial');
        return { rows: [], rowCount: 1 };
      }
      if (query.startsWith('SELECT s.id_solicitud AS id, s.codigo AS code')) return { rows: [requestRow], rowCount: 1 };
      if (query.startsWith('SELECT h.id_solicitud AS "requestId"')) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 1 };
    },
    release() { events.push('RELEASE'); },
  };
  const pool = {
    connect: async () => client,
    async query(sql: string) {
      const query = sql.replace(/\s+/g, ' ').trim();
      if (query.startsWith('SELECT s.id_solicitud AS id, s.codigo AS code')) return { rows: [requestRow], rowCount: 1 };
      if (query.startsWith('SELECT h.id_solicitud AS "requestId"')) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool;
  return { pool, events };
}

test('si falla el historial de creación se revierte la inserción de la solicitud', async () => {
  const { pool, events } = fakePool('history');
  const repository = createRequestRepository(pool);
  await assert.rejects(
    repository.createRequest({ residentId: 1, categoryId: 1, location: 'Torre B', description: 'Descripción suficientemente larga' }),
    /fallo deliberado en historial/,
  );
  assert.equal(events[0].slice(0, 5), 'BEGIN');
  assert.ok(events.includes('ROLLBACK'));
  assert.ok(events.includes('RELEASE'));
  assert.ok(!events.includes('COMMIT'));
});

test('si falla el historial de estado no se confirma el cambio de estado', async () => {
  const { pool, events } = fakePool('status-history');
  const repository = createRequestRepository(pool);
  await assert.rejects(
    repository.changeStatus(7, technician, 'En proceso'),
    /fallo deliberado en historial/,
  );
  assert.ok(events.includes('BEGIN'));
  assert.ok(events.some((event) => event.startsWith('UPDATE solicitudes SET estado')));
  assert.ok(events.includes('ROLLBACK'));
  assert.ok(!events.includes('COMMIT'));
});

test('una solicitud sirve fechas ISO y convierte identificadores a texto', async () => {
  const { pool } = fakePool(null);
  const repository = createRequestRepository(pool);
  const record = await repository.findRequest({ id: 3, name: 'Admin', email: 'admin@cr2.do', role: 'administrador' }, 7);
  assert.equal(record?.id, '7');
  assert.equal(record?.residentId, '1');
  assert.equal(record?.assignedTo, '4');
  assert.equal(record?.createdAt, '2026-01-01T12:00:00.000Z');
});

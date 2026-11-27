import type { Pool, PoolClient } from 'pg';
import type { SessionUser } from '../auth/types.js';
import { RequestError } from './errors.js';
import type {
  HistoryEntry,
  NewRequestInput,
  RequestFilters,
  RequestRecord,
  RequestRepository,
  RequestStatus,
} from './types.js';

type RequestRow = {
  id: number;
  code: string;
  residentId: number;
  residentName: string;
  category: string;
  location: string;
  description: string;
  status: RequestStatus;
  createdAt: Date;
  assignedTo: number | null;
  assignedName: string | null;
  resolution: string | null;
};

type HistoryRow = {
  id: number;
  previousStatus: RequestStatus | null;
  newStatus: RequestStatus;
  userId: number;
  userName: string;
  at: Date;
  note: string | null;
  type: HistoryEntry['type'];
};

type Queryable = Pick<Pool, 'query'>;

const REQUEST_COLUMNS = `
  s.id_solicitud AS id, s.codigo AS code,
  s.id_residente AS "residentId", ur.nombre AS "residentName",
  c.nombre AS category, s.ubicacion AS location, s.descripcion AS description,
  s.estado AS status, s.fecha_creacion AS "createdAt",
  a.id_trabajador AS "assignedTo", ut.nombre AS "assignedName",
  (SELECT h.observacion
     FROM historial_estados h
    WHERE h.id_solicitud = s.id_solicitud AND h.tipo = 'status' AND h.estado_nuevo = 'Resuelta'
    ORDER BY h.fecha_cambio DESC, h.id_historial DESC LIMIT 1) AS resolution
  FROM solicitudes s
  JOIN usuarios ur ON ur.id_usuario = s.id_residente
  JOIN categorias c ON c.id_categoria = s.id_categoria
  LEFT JOIN asignaciones a ON a.id_solicitud = s.id_solicitud AND a.activa = TRUE
  LEFT JOIN usuarios ut ON ut.id_usuario = a.id_trabajador`;

function toIso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function toRecord(row: RequestRow, history: HistoryEntry[]): RequestRecord {
  return {
    id: String(row.id),
    code: row.code,
    residentId: String(row.residentId),
    residentName: row.residentName,
    category: row.category,
    location: row.location,
    description: row.description,
    status: row.status,
    createdAt: toIso(row.createdAt),
    assignedTo: row.assignedTo === null ? null : String(row.assignedTo),
    assignedName: row.assignedName,
    resolution: row.resolution,
    history,
  };
}

function toHistory(row: HistoryRow): HistoryEntry {
  return {
    id: String(row.id),
    previousStatus: row.previousStatus,
    newStatus: row.newStatus,
    userId: String(row.userId),
    userName: row.userName,
    at: toIso(row.at),
    note: row.note ?? '',
    type: row.type,
  };
}

async function fetchOne(db: Queryable, id: number): Promise<RequestRow | undefined> {
  const result = await db.query<RequestRow>(`SELECT ${REQUEST_COLUMNS} WHERE s.id_solicitud = $1`, [id]);
  return result.rows[0];
}

async function fetchHistory(db: Queryable, ids: number[]): Promise<Map<number, HistoryEntry[]>> {
  if (!ids.length) return new Map();
  const result = await db.query<HistoryRow & { requestId: number }>(
    `SELECT h.id_solicitud AS "requestId", h.id_historial AS id,
            h.estado_anterior AS "previousStatus", h.estado_nuevo AS "newStatus",
            h.id_usuario AS "userId", u.nombre AS "userName", h.fecha_cambio AS "at",
            h.observacion AS note, h.tipo AS type
       FROM historial_estados h
       JOIN usuarios u ON u.id_usuario = h.id_usuario
      WHERE h.id_solicitud = ANY($1::int[])
      ORDER BY h.fecha_cambio, h.id_historial`,
    [ids],
  );
  const grouped = new Map<number, HistoryEntry[]>();
  for (const row of result.rows) {
    const entries = grouped.get(row.requestId) ?? [];
    entries.push(toHistory(row));
    grouped.set(row.requestId, entries);
  }
  return grouped;
}

async function recordOf(db: Queryable, row: RequestRow): Promise<RequestRecord> {
  const history = await fetchHistory(db, [row.id]);
  return toRecord(row, history.get(row.id) ?? []);
}

// Todas las escrituras comparten una conexión: si falla cualquier inserción
// del historial, ROLLBACK revierte también el cambio de estado o la asignación.
async function withTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* se conserva el error original */ }
    throw error;
  } finally {
    client.release();
  }
}

function permissionCondition(user: SessionUser): { sql: string; value?: number } {
  if (user.role === 'residente') return { sql: 's.id_residente = $%n%', value: user.id };
  if (user.role === 'mantenimiento') return { sql: 'a.id_trabajador = $%n%', value: user.id };
  return { sql: '' };
}

export function createRequestRepository(pool: Pool): RequestRepository {
  return {
    async createRequest(input) {
      return withTransaction(pool, async (client) => {
        const category = await client.query(
          'SELECT 1 FROM categorias WHERE id_categoria = $1 AND activa = TRUE', [input.categoryId],
        );
        if (category.rowCount === 0) {
          throw new RequestError(400, 'INVALID_CATEGORY', 'La categoría seleccionada no está disponible.');
        }
        const inserted = await client.query<{ id: number }>(
          `INSERT INTO solicitudes (id_residente, id_categoria, descripcion, ubicacion)
           VALUES ($1, $2, $3, $4) RETURNING id_solicitud AS id`,
          [input.residentId, input.categoryId, input.description, input.location],
        );
        const id = inserted.rows[0].id;
        await client.query(
          `INSERT INTO historial_estados
             (id_solicitud, id_usuario, estado_anterior, estado_nuevo, tipo, observacion)
           VALUES ($1, $2, NULL, 'Pendiente', 'created', 'Solicitud registrada')`,
          [id, input.residentId],
        );
        const row = await fetchOne(client, id);
        if (!row) throw new Error('No se pudo devolver la solicitud creada.');
        return recordOf(client, row);
      });
    },

    async listRequests(user, filters) {
      const conditions: string[] = [];
      const values: Array<string | number> = [];
      const add = (template: string, value?: string | number) => {
        const placeholder = `$${values.length + 1}`;
        values.push(value as string | number);
        conditions.push(template.replace('%n%', placeholder));
      };

      const permission = permissionCondition(user);
      if (permission.sql) add(permission.sql, permission.value);
      if (filters.status) add('s.estado = $%n%', filters.status);
      if (filters.search) {
        values.push(`%${filters.search.replace(/[\\%_]/g, '\\$&')}%`);
        const placeholder = `$${values.length}`;
        conditions.push(`(s.codigo ILIKE ${placeholder} ESCAPE '\\' OR c.nombre ILIKE ${placeholder} ESCAPE '\\' OR
                          s.ubicacion ILIKE ${placeholder} ESCAPE '\\' OR ur.nombre ILIKE ${placeholder} ESCAPE '\\')`);
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const result = await pool.query<RequestRow>(
        `SELECT ${REQUEST_COLUMNS} ${where} ORDER BY s.fecha_creacion DESC, s.id_solicitud DESC`, values,
      );
      const history = await fetchHistory(pool, result.rows.map((row) => row.id));
      return result.rows.map((row) => toRecord(row, history.get(row.id) ?? []));
    },

    async findRequest(user, id) {
      const permission = permissionCondition(user);
      const values: Array<string | number> = [id];
      let permissionSql = '';
      if (permission.sql) {
        values.push(permission.value as number);
        permissionSql = `AND ${permission.sql.replace('%n%', '$2')}`;
      }
      const result = await pool.query<RequestRow>(
        `SELECT ${REQUEST_COLUMNS} WHERE s.id_solicitud = $1 ${permissionSql}`, values,
      );
      const row = result.rows[0];
      return row ? recordOf(pool, row) : undefined;
    },

    async assignRequest(requestId, technicianId, administratorId) {
      return withTransaction(pool, async (client) => {
        const locked = await client.query<{ id: number; status: RequestStatus }>(
          'SELECT id_solicitud AS id, estado AS status FROM solicitudes WHERE id_solicitud = $1 FOR UPDATE',
          [requestId],
        );
        const request = locked.rows[0];
        if (!request) throw new RequestError(404, 'NOT_FOUND', 'La solicitud no existe.');
        if (request.status !== 'Pendiente') {
          throw new RequestError(409, 'INVALID_STATE', 'Solo se pueden asignar solicitudes pendientes.');
        }
        const technician = await client.query<{ name: string }>(
          `SELECT nombre AS name FROM usuarios
            WHERE id_usuario = $1 AND rol = 'mantenimiento' AND activo = TRUE`, [technicianId],
        );
        const technicianName = technician.rows[0]?.name;
        if (!technicianName) {
          throw new RequestError(400, 'INVALID_TECHNICIAN', 'Selecciona un trabajador activo de mantenimiento.');
        }

        await client.query('UPDATE asignaciones SET activa = FALSE WHERE id_solicitud = $1 AND activa = TRUE', [requestId]);
        await client.query(
          `INSERT INTO asignaciones (id_solicitud, id_trabajador, id_administrador, observacion)
           VALUES ($1, $2, $3, $4)`,
          [requestId, technicianId, administratorId, `Asignada a ${technicianName}`],
        );
        await client.query(
          `INSERT INTO historial_estados
             (id_solicitud, id_usuario, estado_anterior, estado_nuevo, tipo, observacion)
           VALUES ($1, $2, $3, $3, 'assignment', $4)`,
          [requestId, administratorId, request.status, `Asignada a ${technicianName}. El estado se conserva en ${request.status}.`],
        );
        const row = await fetchOne(client, requestId);
        if (!row) throw new Error('No se pudo devolver la solicitud asignada.');
        return recordOf(client, row);
      });
    },

    async changeStatus(requestId, user, next, description) {
      if (next === 'Pendiente') {
        throw new RequestError(400, 'INVALID_INPUT', 'El estado Pendiente no se puede asignar manualmente.');
      }
      return withTransaction(pool, async (client) => {
        const locked = await client.query<{ id: number; status: RequestStatus; assignedTo: number | null }>(
          `SELECT s.id_solicitud AS id, s.estado AS status, a.id_trabajador AS "assignedTo"
             FROM solicitudes s
             LEFT JOIN asignaciones a ON a.id_solicitud = s.id_solicitud AND a.activa = TRUE
            WHERE s.id_solicitud = $1 FOR UPDATE OF s`,
          [requestId],
        );
        const request = locked.rows[0];
        // Sin asignación propia se responde como inexistente: no se revela si el caso pertenece a otro técnico.
        if (!request || request.assignedTo !== user.id) return undefined;
        const valid = (request.status === 'Pendiente' && next === 'En proceso') ||
          (request.status === 'En proceso' && next === 'Resuelta');
        if (!valid) {
          throw new RequestError(409, 'INVALID_TRANSITION', 'Solo se puede avanzar un paso: Pendiente → En proceso → Resuelta.');
        }
        if (next === 'Resuelta' && (!description || description.length < 15)) {
          throw new RequestError(400, 'INVALID_INPUT', 'Describe el trabajo realizado antes de resolver la solicitud.');
        }
        const note = next === 'En proceso' ? 'Trabajo iniciado' : description!;
        await client.query('UPDATE solicitudes SET estado = $1 WHERE id_solicitud = $2', [next, requestId]);
        await client.query(
          `INSERT INTO historial_estados
             (id_solicitud, id_usuario, estado_anterior, estado_nuevo, tipo, observacion)
           VALUES ($1, $2, $3, $4, 'status', $5)`,
          [requestId, user.id, request.status, next, note],
        );
        const row = await fetchOne(client, requestId);
        if (!row) throw new Error('No se pudo devolver la solicitud actualizada.');
        return recordOf(client, row);
      });
    },
  };
}

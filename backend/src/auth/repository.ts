import type { Pool } from 'pg';
import type { AuthRepository, LoginUser, SessionUser } from './types.js';

export function createAuthRepository(pool: Pick<Pool, 'query'>): AuthRepository {
  return {
    async findUserByEmail(email) {
      const result = await pool.query<LoginUser>(
        `SELECT id_usuario AS id, nombre AS name, correo AS email, rol AS role,
                contrasena AS "passwordHash", activo AS active
         FROM usuarios WHERE correo = $1`, [email],
      );
      return result.rows[0];
    },
    async createSession(userId, tokenHash, expiresAt, previousHash) {
      // Revocar la cookie anterior y crear la nueva dentro de la misma sentencia.
      const result = await pool.query(
        `WITH revocada AS (
           DELETE FROM sesiones WHERE token_hash = $4
         )
         INSERT INTO sesiones (id_usuario, token_hash, fecha_expiracion)
         SELECT id_usuario, $2, $3 FROM usuarios WHERE id_usuario = $1 AND activo = TRUE
         RETURNING token_hash`,
        [userId, tokenHash, expiresAt, previousHash ?? null],
      );
      return result.rowCount === 1;
    },
    async findSession(tokenHash) {
      const result = await pool.query<SessionUser>(
        `SELECT u.id_usuario AS id, u.nombre AS name, u.correo AS email, u.rol AS role
         FROM sesiones s JOIN usuarios u ON u.id_usuario = s.id_usuario
         WHERE s.token_hash = $1 AND s.fecha_expiracion > CURRENT_TIMESTAMP AND u.activo = TRUE`,
        [tokenHash],
      );
      return result.rows[0];
    },
    async deleteSession(tokenHash) {
      await pool.query('DELETE FROM sesiones WHERE token_hash = $1', [tokenHash]);
    },
    async listTechnicians() {
      const result = await pool.query<SessionUser>(
        `SELECT id_usuario AS id, nombre AS name, correo AS email, rol AS role
         FROM usuarios WHERE rol = 'mantenimiento' AND activo = TRUE ORDER BY nombre, id_usuario`,
      );
      return result.rows;
    },
  };
}

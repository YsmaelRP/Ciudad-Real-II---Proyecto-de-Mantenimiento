import type { Pool } from 'pg';
import { publicCategory, type CategoryRepository, type CategoryRow } from './types.js';

export function createCategoryRepository(pool: Pick<Pool, 'query'>): CategoryRepository {
  return {
    async listActive() {
      const result = await pool.query<CategoryRow>(
        `SELECT id_categoria AS id, nombre AS name, descripcion AS description
         FROM categorias
         WHERE activa = TRUE
         ORDER BY nombre, id_categoria`,
      );
      return result.rows.map(publicCategory);
    },
  };
}

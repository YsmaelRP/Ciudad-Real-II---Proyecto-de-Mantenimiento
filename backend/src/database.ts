import { Pool } from 'pg';

export function createDatabase(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 30_000,
    query_timeout: 5000,
    statement_timeout: 5000,
  });

  pool.on('error', () => {
    // No registrar la URL de conexión ni credenciales en los logs.
    console.error('Se perdió una conexión inactiva con PostgreSQL.');
  });

  return {
    async checkConnection(): Promise<void> {
      await pool.query('SELECT 1');
    },
    async close(): Promise<void> {
      await pool.end();
    },
  };
}

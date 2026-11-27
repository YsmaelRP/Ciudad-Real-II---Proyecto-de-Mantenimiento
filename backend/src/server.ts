import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { createDatabase } from './database.js';
import { createAuthRepository } from './auth/repository.js';

loadEnv({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

const config = readConfig(process.env);
const database = config.databaseUrl ? createDatabase(config.databaseUrl) : undefined;
const app = createApp({
  frontendOrigin: config.frontendOrigin,
  checkDatabase: database?.checkConnection,
  authRepository: database ? createAuthRepository(database.pool) : undefined,
  secureCookies: config.secureCookies,
});
if (!database) {
  console.warn('DATABASE_URL no está configurada. /api/ready responderá 503.');
}
const server = app.listen(config.port, config.host, () => {
  console.log(`API disponible en http://${config.host}:${config.port}`);
});

server.on('error', () => {
  console.error('No se pudo iniciar la API. Revisa el host y el puerto configurados.');
  process.exitCode = 1;
  void database?.close().catch(() => { process.exitCode = 1; });
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close((error) => {
    process.exitCode = error ? 1 : 0;
    void database?.close().catch(() => { process.exitCode = 1; });
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

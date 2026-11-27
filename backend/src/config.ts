export type Config = {
  host: string;
  port: number;
  frontendOrigin: string;
  databaseUrl?: string;
  secureCookies: boolean;
};

export function readConfig(env: NodeJS.ProcessEnv): Config {
  const port = env.PORT ?? '3001';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('PORT debe ser un número entero entre 1 y 65535.');
  }

  const host = env.HOST ?? '127.0.0.1';
  if (!host.trim()) throw new Error('HOST no puede estar vacío.');

  const frontendOrigin = env.FRONTEND_ORIGIN ?? 'http://localhost:8443';
  let origin: URL;
  try {
    origin = new URL(frontendOrigin);
  } catch {
    throw new Error('FRONTEND_ORIGIN debe ser un origen HTTP o HTTPS válido.');
  }
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== frontendOrigin) {
    throw new Error('FRONTEND_ORIGIN debe contener solo protocolo, host y puerto, sin ruta.');
  }

  const databaseUrl = env.DATABASE_URL?.trim() || undefined;
  if (databaseUrl) {
    let database: URL;
    try {
      database = new URL(databaseUrl);
    } catch {
      throw new Error('DATABASE_URL debe ser una URL válida de PostgreSQL.');
    }
    if (!['postgres:', 'postgresql:'].includes(database.protocol) || !database.hostname || database.pathname.length <= 1) {
      throw new Error('DATABASE_URL debe indicar un servidor PostgreSQL y una base de datos.');
    }
  }

  const nodeEnv = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('NODE_ENV debe ser development, test o production.');
  }
  if (nodeEnv === 'production' && origin.protocol !== 'https:') {
    throw new Error('FRONTEND_ORIGIN debe usar HTTPS en producción.');
  }

  return { host, port: Number(port), frontendOrigin, databaseUrl, secureCookies: nodeEnv === 'production' };
}

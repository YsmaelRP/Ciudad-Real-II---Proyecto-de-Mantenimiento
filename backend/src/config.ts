export type Config = {
  host: string;
  port: number;
  frontendOrigin: string;
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

  return { host, port: Number(port), frontendOrigin };
}

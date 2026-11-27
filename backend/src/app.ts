import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { createAuthRouter } from './auth/routes.js';
import type { AuthRepository } from './auth/types.js';
import { createRequestsRouter } from './requests/routes.js';
import type { RequestRepository } from './requests/types.js';

export function createApp(options: {
  frontendOrigin: string;
  checkDatabase?: () => Promise<void>;
  authRepository?: AuthRepository;
  requestRepository?: RequestRepository;
  secureCookies?: boolean;
}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: options.frontendOrigin, credentials: true }));
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Separado de health: Express puede funcionar aunque PostgreSQL no esté listo.
  app.get('/api/ready', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!options.checkDatabase) {
      res.status(503).json({ status: 'not_ready' });
      return;
    }
    try {
      await options.checkDatabase();
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'not_ready' });
    }
  });

  app.use('/api', createAuthRouter({
    frontendOrigin: options.frontendOrigin,
    repository: options.authRepository,
    secureCookies: options.secureCookies,
  }));

  app.use('/api', createRequestsRouter({
    frontendOrigin: options.frontendOrigin,
    authRepository: options.authRepository,
    repository: options.requestRepository,
    secureCookies: options.secureCookies,
  }));

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada.' } });
  });

  const handleError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    const status = error && typeof error === 'object' && 'status' in error ? error.status : 500;
    if (status === 400) {
      res.status(400).json({ error: { code: 'INVALID_JSON', message: 'El cuerpo JSON no es válido.' } });
    } else if (status === 413) {
      res.status(413).json({ error: { code: 'BODY_TOO_LARGE', message: 'El cuerpo supera el tamaño permitido.' } });
    } else {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor.' } });
    }
  };
  app.use(handleError);

  return app;
}

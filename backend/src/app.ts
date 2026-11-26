import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';

export function createApp(options: { frontendOrigin: string }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: options.frontendOrigin, credentials: true }));
  app.use(express.json({ limit: '32kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

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

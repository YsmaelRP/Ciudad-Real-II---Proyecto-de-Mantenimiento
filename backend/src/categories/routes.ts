import { Router, type RequestHandler } from 'express';
import type { CategoryRepository } from './types.js';

export function createCategoriesRouter(options: {
  repository?: CategoryRepository;
  authenticate: RequestHandler;
}) {
  const router = Router();

  router.use('/categories', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/categories', options.authenticate, async (_req, res) => {
    if (!options.repository) {
      res.status(503).json({ error: { code: 'CATALOG_UNAVAILABLE', message: 'El catálogo de categorías no está configurado.' } });
      return;
    }
    const categories = await options.repository.listActive();
    res.json({ categories });
  });

  return router;
}

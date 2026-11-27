import { Router } from 'express';
import { requireRoles, requireSession, requireTrustedJson } from '../auth/middleware.js';
import type { AuthRepository } from '../auth/types.js';
import { sendRequestError } from './errors.js';
import type { RequestRepository } from './types.js';
import {
  bodyObject,
  parseFilters,
  parseNewRequest,
  parsePositiveId,
  parseStatusChange,
  parseTechnicianId,
} from './validation.js';

export function createRequestsRouter(options: {
  frontendOrigin: string;
  authRepository?: AuthRepository;
  repository?: RequestRepository;
  secureCookies?: boolean;
}) {
  const router = Router();
  const unavailable = () => options.authRepository === undefined || options.repository === undefined;

  router.use('/requests', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  if (unavailable()) {
    router.use('/requests', (_req, res) => {
      res.status(503).json({ error: { code: 'REQUESTS_UNAVAILABLE', message: 'El servicio de solicitudes no está configurado.' } });
    });
    return router;
  }

  const { repository, authRepository } = options;
  const authenticated = requireSession(authRepository!, options.secureCookies ?? false);
  const trustedJson = requireTrustedJson(options.frontendOrigin);

  router.post('/requests', authenticated, requireRoles('residente'), trustedJson, async (req, res) => {
    try {
      const input = parseNewRequest(bodyObject(req));
      const request = await repository!.createRequest({ ...input, residentId: req.user!.id });
      res.status(201).json({ request });
    } catch (error) {
      if (!sendRequestError(res, error)) throw error;
    }
  });

  router.get('/requests', authenticated, async (req, res) => {
    try {
      const requests = await repository!.listRequests(req.user!, parseFilters(req.query));
      res.json({ requests });
    } catch (error) {
      if (!sendRequestError(res, error)) throw error;
    }
  });

  router.get('/requests/:id', authenticated, async (req, res) => {
    try {
      const request = await repository!.findRequest(req.user!, parsePositiveId(req.params.id, 'identificador de solicitud'));
      if (!request) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'La solicitud no existe o no está disponible para tu cuenta.' } });
        return;
      }
      res.json({ request });
    } catch (error) {
      if (!sendRequestError(res, error)) throw error;
    }
  });

  router.patch('/requests/:id/assignment', authenticated, requireRoles('administrador'), trustedJson, async (req, res) => {
    try {
      const id = parsePositiveId(req.params.id, 'identificador de solicitud');
      const technicianId = parseTechnicianId(bodyObject(req));
      const request = await repository!.assignRequest(id, technicianId, req.user!.id);
      if (!request) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'La solicitud no existe o no está disponible para tu cuenta.' } });
        return;
      }
      res.json({ request });
    } catch (error) {
      if (!sendRequestError(res, error)) throw error;
    }
  });

  router.patch('/requests/:id/status', authenticated, requireRoles('mantenimiento'), trustedJson, async (req, res) => {
    try {
      const id = parsePositiveId(req.params.id, 'identificador de solicitud');
      const change = parseStatusChange(bodyObject(req));
      const request = await repository!.changeStatus(id, req.user!, change.status, change.description);
      if (!request) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'La solicitud no existe o no tienes un trabajo asignado.' } });
        return;
      }
      res.json({ request });
    } catch (error) {
      if (!sendRequestError(res, error)) throw error;
    }
  });

  return router;
}

import type { RequestHandler } from 'express';
import type { AuthRepository, Role } from './types.js';
import { readSessionHash, SESSION_COOKIE, sessionCookieOptions } from './session.js';

export function requireSession(repository: AuthRepository, secureCookies = false): RequestHandler {
  return async (req, res, next) => {
    const tokenHash = readSessionHash(req);
    const user = tokenHash ? await repository.findSession(tokenHash) : undefined;
    if (!user) {
      res.clearCookie(SESSION_COOKIE, sessionCookieOptions(secureCookies));
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Debes iniciar sesión.' } });
      return;
    }
    req.user = user;
    next();
  };
}

export function requireRoles(...roles: Role[]): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Debes iniciar sesión.' } });
    } else if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Tu cuenta no tiene permiso para esta acción.' } });
    } else {
      next();
    }
  };
}

export function requireTrustedJson(frontendOrigin: string): RequestHandler {
  return (req, res, next) => {
    const origin = req.get('Origin');
    // Origin protege las peticiones del navegador. Sin Origin se permiten
    // clientes REST, pero no peticiones identificadas como cross-site.
    if ((origin !== undefined && origin !== frontendOrigin) ||
        (origin === undefined && req.get('Sec-Fetch-Site') === 'cross-site')) {
      res.status(403).json({ error: { code: 'UNTRUSTED_ORIGIN', message: 'Origen no autorizado.' } });
    } else if (!req.is('application/json')) {
      res.status(415).json({ error: { code: 'JSON_REQUIRED', message: 'Envía el cuerpo como application/json.' } });
    } else {
      next();
    }
  };
}

import { randomBytes } from 'node:crypto';
import { compare, hashSync } from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireRoles, requireSession, requireTrustedJson } from './middleware.js';
import { hashToken, readSessionHash, SESSION_COOKIE, SESSION_TTL_MS, sessionCookieOptions } from './session.js';
import { publicUser, type AuthRepository } from './types.js';

// Comparación bcrypt también para correos inexistentes, evitando el atajo rápido.
const dummyPasswordHash = hashSync(randomBytes(32).toString('hex'), 10);

export function createAuthRouter(options: {
  frontendOrigin: string;
  repository?: AuthRepository;
  secureCookies?: boolean;
}) {
  const router = Router();
  router.use(['/auth', '/technicians'], (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  const repository = options.repository;
  if (!repository) {
    router.use(['/auth', '/technicians'], (_req, res) => {
      res.status(503).json({ error: { code: 'AUTH_UNAVAILABLE', message: 'El servicio de acceso no está configurado.' } });
    });
    return router;
  }

  const secureCookies = options.secureCookies ?? false;
  const cookieOptions = sessionCookieOptions(secureCookies);
  const trustedJson = requireTrustedJson(options.frontendOrigin);
  const authenticated = requireSession(repository, secureCookies);
  const loginLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: { code: 'TOO_MANY_ATTEMPTS', message: 'Demasiados intentos. Inténtalo más tarde.' } });
    },
  });

  router.post('/auth/login', trustedJson, loginLimit, async (req, res) => {
    const body: unknown = req.body;
    const data = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
    const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
    const password = typeof data.password === 'string' ? data.password : '';
    if (email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        !password || Buffer.byteLength(password, 'utf8') > 72) {
      res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Indica un correo válido y una contraseña de hasta 72 bytes.' } });
      return;
    }

    const user = await repository.findUserByEmail(email);
    const validPassword = await compare(password, user?.passwordHash ?? dummyPasswordHash);
    if (!user || !user.active || !validPassword) {
      res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Correo o contraseña incorrectos.' } });
      return;
    }

    const token = randomBytes(32).toString('hex');
    const created = await repository.createSession(
      user.id, hashToken(token), new Date(Date.now() + SESSION_TTL_MS), readSessionHash(req),
    );
    if (!created) {
      res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Correo o contraseña incorrectos.' } });
      return;
    }
    res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_TTL_MS });
    res.json({ user: publicUser(user) });
  });

  router.get('/auth/me', authenticated, (req, res) => {
    res.json({ user: publicUser(req.user!) });
  });

  router.post('/auth/logout', trustedJson, async (req, res) => {
    const tokenHash = readSessionHash(req);
    if (tokenHash) await repository.deleteSession(tokenHash);
    res.clearCookie(SESSION_COOKIE, cookieOptions);
    res.sendStatus(204);
  });

  router.get('/technicians', authenticated, requireRoles('administrador'), async (_req, res) => {
    const technicians = await repository.listTechnicians();
    res.json({ technicians: technicians.map(publicUser) });
  });

  return router;
}

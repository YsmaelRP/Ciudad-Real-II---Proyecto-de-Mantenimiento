import { createHash } from 'node:crypto';
import type { CookieOptions, Request } from 'express';

export const SESSION_COOKIE = 'cr2_session';
export const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

export function sessionCookieOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure, path: '/api' };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function readSessionHash(req: Request): string | undefined {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  return typeof token === 'string' && /^[0-9a-f]{64}$/.test(token) ? hashToken(token) : undefined;
}

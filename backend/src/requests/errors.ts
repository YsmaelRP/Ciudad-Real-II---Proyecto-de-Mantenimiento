import type { Response } from 'express';

// Errores de dominio de solicitudes. El mensaje es seguro para mostrarlo al
// usuario; los errores inesperados siguen manejándose como 500 genérico.
export class RequestError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = 'RequestError';
  }
}

export function sendRequestError(res: Response, error: unknown): boolean {
  if (!(error instanceof RequestError)) return false;
  res.status(error.status).json({ error: { code: error.code, message: error.message } });
  return true;
}

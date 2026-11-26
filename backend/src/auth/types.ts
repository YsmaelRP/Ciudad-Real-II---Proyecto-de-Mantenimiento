export type Role = 'residente' | 'administrador' | 'mantenimiento';

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: Role;
};

export type LoginUser = SessionUser & { passwordHash: string; active: boolean };

export interface AuthRepository {
  findUserByEmail(email: string): Promise<LoginUser | undefined>;
  createSession(userId: number, tokenHash: string, expiresAt: Date, previousHash?: string): Promise<boolean>;
  findSession(tokenHash: string): Promise<SessionUser | undefined>;
  deleteSession(tokenHash: string): Promise<void>;
  listTechnicians(): Promise<SessionUser[]>;
}

// Mantener los nombres de rol que ya utiliza React, sin exponer campos internos.
export function publicUser(user: SessionUser) {
  const roles = { residente: 'resident', administrador: 'admin', mantenimiento: 'maintenance' } as const;
  return {
    id: String(user.id),
    name: user.name,
    email: user.email,
    role: roles[user.role],
    initials: user.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase(),
  };
}

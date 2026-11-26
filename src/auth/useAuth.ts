import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../api/auth';
import { ApiError } from '../api/client';

export function useAuth() {
  const [user, setUser] = useState<api.AuthUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const version = useRef(0);
  const mutating = useRef(false);

  const restoreSession = useCallback(async (signal?: AbortSignal) => {
    if (mutating.current) return;
    const current = ++version.current;
    try {
      const restored = await api.getSession(signal);
      if (signal?.aborted || current !== version.current) return;
      setUser(restored);
      setSessionError('');
    } catch (error) {
      if (signal?.aborted || current !== version.current) return;
      setUser(null);
      setSessionError(error instanceof ApiError && error.status === 401 ? '' : 'No se pudo comprobar la sesión. Revisa la conexión con la API.');
    } finally {
      if (!signal?.aborted && current === version.current) setChecking(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void restoreSession(controller.signal);
    const onFocus = () => { void restoreSession(controller.signal); };
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') onFocus();
    }, 60_000);
    window.addEventListener('focus', onFocus);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [restoreSession]);

  const login = async (email: string, password: string) => {
    mutating.current = true;
    const current = ++version.current;
    try {
      const authenticated = await api.login(email, password);
      if (current === version.current) {
        setUser(authenticated);
        setSessionError('');
      }
    } finally {
      mutating.current = false;
    }
  };

  const logout = async () => {
    mutating.current = true;
    const current = ++version.current;
    setLoggingOut(true);
    try {
      await api.logout();
      if (current === version.current) {
        setUser(null);
        setSessionError('');
      }
    } catch {
      setSessionError('No se pudo confirmar el cierre de sesión. Comprueba la conexión y vuelve a intentarlo.');
    } finally {
      mutating.current = false;
      setLoggingOut(false);
    }
  };

  const retrySession = () => {
    if (mutating.current) return;
    setChecking(true);
    void restoreSession();
  };

  const invalidateSession = useCallback(() => {
    version.current++;
    setUser(null);
    setSessionError('Tu sesión ya no es válida. Inicia sesión de nuevo.');
  }, []);

  return { user, checking, loggingOut, sessionError, login, logout, retrySession, invalidateSession };
}

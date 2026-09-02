import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { get, post, setToken, getToken } from './api';
import { AuthContext, type AuthState } from './auth-context';
import type { User } from './types';

interface AuthResponse {
  accessToken: string;
  user: User;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await get<User>('/auth/me'));
    } catch {
      // Expired or invalid token — drop it rather than looping on 401s.
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Wrapped so no setState runs synchronously in the effect body.
    let cancelled = false;
    void (async () => {
      if (!cancelled) await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      async login(email, password) {
        const result = await post<AuthResponse>(
          '/auth/login',
          { email, password },
          false,
        );
        setToken(result.accessToken);
        setUser(result.user);
      },
      async register(input) {
        const result = await post<AuthResponse>('/auth/register', input, false);
        setToken(result.accessToken);
        setUser(result.user);
      },
      logout() {
        setToken(null);
        setUser(null);
      },
      refresh,
      hasRole(...roles) {
        return user ? roles.includes(user.role) : false;
      },
    }),
    [user, loading, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

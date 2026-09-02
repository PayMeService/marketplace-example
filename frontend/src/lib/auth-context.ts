import { createContext, useContext } from 'react';
import type { Role, User } from './types';

export interface AuthState {
  user: User | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  register(input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }): Promise<void>;
  logout(): void;
  /** Re-read the session — call after an action that changes the user's role. */
  refresh(): Promise<void>;
  hasRole(...roles: Role[]): boolean;
}

/**
 * Split from auth.tsx so that file exports only the provider component.
 * Mixing components and non-component exports in one module breaks React Fast
 * Refresh — the whole module reloads instead of the component, losing state.
 */
export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

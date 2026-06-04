import { createContext, useContext, useState, useCallback } from 'react';
import { login } from '../api/authApi.js';

/**
 * AuthContext — provides authentication state to the entire app.
 *
 * Shape:
 *   token       — string | null   Bearer token; null = not logged in
 *   isLoading   — boolean
 *   error       — string | null
 *   submitLogin — (email, password) => Promise<void>
 *   logout      — () => void
 */

const STORAGE_KEY = 'explarax_token';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Rehydrate from sessionStorage so a page refresh doesn't force re-login.
  // sessionStorage (not localStorage) — token is cleared when the tab closes.
  const [token, setToken]     = useState(() => sessionStorage.getItem(STORAGE_KEY) ?? null);
  const [isLoading, setLoading] = useState(false);
  const [error, setError]       = useState(null);

  /**
   * Call GET /api/login, extract token from loginData.account.token,
   * persist it to sessionStorage, and update state — all in one step.
   */
  const submitLogin = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const bearer = await login(email, password);
      sessionStorage.setItem(STORAGE_KEY, bearer);
      setToken(bearer);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setError(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, isLoading, error, submitLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * useAuth — consume auth context anywhere in the tree.
 * Must be used inside <AuthProvider>.
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

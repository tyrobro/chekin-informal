import { useState } from 'react';
import { signInWithPassword } from '../../../services/staffAuthService.js';
import styles from './StaffAuth.module.css';

/**
 * StaffLogin — existing-account password login screen.
 *
 * Props:
 *   email      — string — pre-filled from the invite validation response
 *   onSuccess  — (session) => void — called after successful sign-in
 */
export default function StaffLogin({ email, onSuccess }) {
  const [password, setPassword] = useState('');
  const [error, setError]       = useState(null);
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password) return;

    setLoading(true);
    setError(null);

    try {
      const session = await signInWithPassword(email, password);
      onSuccess(session);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        {/* Logo mark */}
        <div className={styles.logoWrap} aria-hidden="true">
          <div className={styles.logo}>X</div>
        </div>

        <h1 className={styles.title}>Welcome back</h1>
        <p className={styles.subtitle}>Sign in to start your check-in shift.</p>

        <form onSubmit={handleSubmit} noValidate className={styles.form}>
          {/* Email — read-only, pre-filled */}
          <div className={styles.field}>
            <label htmlFor="staff-login-email" className={styles.label}>
              Email
            </label>
            <input
              id="staff-login-email"
              type="email"
              value={email}
              readOnly
              aria-readonly="true"
              className={`${styles.input} ${styles.inputReadOnly}`}
              autoComplete="email"
            />
          </div>

          {/* Password */}
          <div className={styles.field}>
            <label htmlFor="staff-login-password" className={styles.label}>
              Password
            </label>
            <input
              id="staff-login-password"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
              className={styles.input}
              aria-describedby={error ? 'staff-login-error' : undefined}
            />
          </div>

          {/* Inline error */}
          {error && (
            <p id="staff-login-error" className={styles.error} role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className={styles.submitButton}
          >
            {loading ? (
              <span className={styles.spinnerRow}>
                <svg className={styles.spinner} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle className={styles.spinnerTrack} cx="12" cy="12" r="10"
                    stroke="currentColor" strokeWidth="3.5" />
                  <path className={styles.spinnerFill} fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Signing in…
              </span>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

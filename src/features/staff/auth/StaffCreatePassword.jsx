import { useState } from 'react';
import { signUp, linkAuthUser } from '../../../services/staffAuthService.js';
import styles from './StaffAuth.module.css';

/**
 * StaffCreatePassword — first-time account setup screen.
 *
 * Props:
 *   email      — string — pre-filled from the invite validation response (read-only)
 *   name       — string — staff member's name, shown for context
 *   gate       — string — gate assignment, shown for context
 *   eventName  — string | undefined — event name, shown if available
 *   staffId    — string — checkin_staff row id, used to link auth_user_id
 *   onSuccess  — (session) => void — called after signup + linking
 */
export default function StaffCreatePassword({
  email,
  name,
  gate,
  eventName,
  staffId,
  onSuccess,
}) {
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error,           setError]           = useState(null);
  const [loading,         setLoading]         = useState(false);

  // ── Validation ────────────────────────────────────────────────────────────
  const passwordTooShort = password.length > 0 && password.length < 8;
  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const canSubmit =
    password.length >= 8 &&
    confirmPassword.length > 0 &&
    password === confirmPassword &&
    !loading;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError(null);

    try {
      const session = await signUp(email, password);
      // Link the Supabase auth user id to the checkin_staff row
      await linkAuthUser(staffId, session.user.id, session.access_token);
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

        <h1 className={styles.title}>Create your account</h1>

        {/* Context card — event / gate assignment */}
        <div className={styles.contextCard} aria-label="Your assignment">
          {eventName && (
            <p className={styles.contextLine}>
              <span className={styles.contextLabel}>Event</span>
              <span className={styles.contextValue}>{eventName}</span>
            </p>
          )}
          {name && (
            <p className={styles.contextLine}>
              <span className={styles.contextLabel}>Name</span>
              <span className={styles.contextValue}>{name}</span>
            </p>
          )}
          {gate && (
            <p className={styles.contextLine}>
              <span className={styles.contextLabel}>Gate</span>
              <span className={styles.contextValue}>{gate}</span>
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} noValidate className={styles.form}>
          {/* Email — read-only */}
          <div className={styles.field}>
            <label htmlFor="staff-signup-email" className={styles.label}>
              Email
            </label>
            <input
              id="staff-signup-email"
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
            <label htmlFor="staff-signup-password" className={styles.label}>
              Password
            </label>
            <input
              id="staff-signup-password"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              placeholder="Minimum 8 characters"
              required
              minLength={8}
              autoComplete="new-password"
              aria-invalid={passwordTooShort}
              aria-describedby={
                passwordTooShort ? 'pw-short-hint' :
                error ? 'staff-signup-error' : undefined
              }
              className={`${styles.input} ${passwordTooShort ? styles.inputError : ''}`}
            />
            {passwordTooShort && (
              <p id="pw-short-hint" className={styles.fieldHint}>
                Password must be at least 8 characters.
              </p>
            )}
          </div>

          {/* Confirm Password */}
          <div className={styles.field}>
            <label htmlFor="staff-signup-confirm" className={styles.label}>
              Confirm Password
            </label>
            <input
              id="staff-signup-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
              placeholder="Re-enter your password"
              required
              autoComplete="new-password"
              aria-invalid={passwordMismatch}
              aria-describedby={
                passwordMismatch ? 'pw-mismatch-hint' :
                error ? 'staff-signup-error' : undefined
              }
              className={`${styles.input} ${passwordMismatch ? styles.inputError : ''}`}
            />
            {passwordMismatch && (
              <p id="pw-mismatch-hint" className={styles.fieldHint}>
                Passwords do not match.
              </p>
            )}
          </div>

          {/* Server error */}
          {error && (
            <p id="staff-signup-error" className={styles.error} role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
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
                Creating account…
              </span>
            ) : (
              'Create Account & Continue'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

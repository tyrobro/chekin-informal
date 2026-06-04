import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import Button from '../../components/Button/Button.jsx';
import styles from './LoginScreen.module.css';

/**
 * LoginScreen — single-step login form.
 *
 * Submits email + password to /api/login.
 * On success the token is set in AuthContext and App.jsx
 * renders EventDashboard automatically.
 */
function LoginScreen() {
  const { isLoading, error, submitLogin } = useAuth();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    submitLogin(email.trim(), password);
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {/* Branding */}
        <div className={styles.brand}>
          <span className={styles.brandMark}>X</span>
          <span className={styles.brandName}>ExplaraX</span>
        </div>

        <h1 className={styles.heading}>Sign in to Host Dashboard</h1>
        <p className={styles.subheading}>
          Enter your ExplaraX account credentials.
        </p>

        <form onSubmit={handleSubmit} className={styles.form} noValidate>
          <div className={styles.field}>
            <label htmlFor="email" className={styles.label}>Email</label>
            <input
              id="email"
              type="email"
              className={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password" className={styles.label}>Password</label>
            <input
              id="password"
              type="password"
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <p className={styles.errorMsg} role="alert">{error}</p>
          )}

          <Button
            variant="primary"
            disabled={isLoading || !email || !password}
          >
            {isLoading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default LoginScreen;

import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';

/**
 * LoginScreen — single-step login form.
 *
 * Submits email + password to /api/login.
 * On success the token is set in AuthContext and App.jsx
 * renders EventDashboard automatically.
 *
 * All business logic is unchanged — only markup and Tailwind classes updated.
 */
function LoginScreen() {
  const { isLoading, error, submitLogin } = useAuth();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    submitLogin(email.trim(), password);
  };

  const canSubmit = !isLoading && email && password;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">

        {/* ── Card ── */}
        <div className="bg-white border border-slate-100 rounded-2xl shadow-md px-8 py-10 space-y-8">

          {/* ── Brand ── */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center
                            text-white font-black text-base tracking-tight select-none">
              X
            </div>
            <span className="text-lg font-bold text-slate-900 tracking-tight">ExplaraX</span>
          </div>

          {/* ── Heading ── */}
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Sign in to Host Dashboard
            </h1>
            <p className="text-sm text-slate-500">
              Enter your ExplaraX account credentials to continue.
            </p>
          </div>

          {/* ── Form ── */}
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>

            {/* Email */}
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-700"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                className="w-full py-2.5 px-4 text-sm text-slate-900 bg-white
                           border border-slate-200 rounded-xl placeholder:text-slate-400
                           transition-all duration-200 ease-in-out
                           focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
                           focus:border-indigo-500"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                className="w-full py-2.5 px-4 text-sm text-slate-900 bg-white
                           border border-slate-200 rounded-xl placeholder:text-slate-400
                           transition-all duration-200 ease-in-out
                           focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
                           focus:border-indigo-500"
              />
            </div>

            {/* Error banner */}
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 bg-red-50 border border-red-200
                           text-red-700 text-sm rounded-xl px-4 py-3"
              >
                <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold text-white
                         bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800
                         transition-all duration-200 ease-in-out
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
                         disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Signing in…
                </span>
              ) : (
                'Sign in'
              )}
            </button>

          </form>
        </div>

        {/* ── Footer note ── */}
        <p className="mt-6 text-center text-xs text-slate-400">
          ExplaraX Check-in Host Dashboard · Slice B1
        </p>
      </div>
    </div>
  );
}

export default LoginScreen;

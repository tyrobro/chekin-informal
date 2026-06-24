import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import LoginScreen from './features/event-dashboard/auth/LoginScreen.jsx';
import EventDashboard from './features/event-dashboard/prepare-sync/EventDashboard.jsx';
import StaffAppShell from './features/staff/StaffAppShell.jsx';
import StaffInviteRouter from './features/staff/auth/StaffInviteRouter.jsx';

/**
 * Redirects legacy /staff?token=... links to /staff/invite?token=...
 * Backward compatibility only — no auth logic here.
 */
function LegacyStaffRedirect() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  if (token) {
    return <Navigate to={`/staff/invite?token=${encodeURIComponent(token)}`} replace />;
  }
  // No token on /staff — fall through to the legacy dev shell
  return <StaffAppShell />;
}

/**
 * App — root component.
 *
 * Routes:
 * - /              : Host dashboard (requires host auth token)
 * - /staff/invite  : Staff invitation auth flow (I6)
 * - /staff         : Legacy redirect — /staff?token=x → /staff/invite?token=x
 * - /staff/*       : Legacy dev route — bypasses auth for QR testing
 */
function App() {
  const { token } = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        {/* Host Environment Boundary */}
        <Route
          path="/"
          element={token ? <EventDashboard /> : <LoginScreen />}
        />

        {/* Staff Invitation Auth Flow (I6) — declared BEFORE /staff/* */}
        <Route
          path="/staff/invite"
          element={<StaffInviteRouter />}
        />

        {/* Legacy redirect: /staff?token=... → /staff/invite?token=... */}
        <Route
          path="/staff"
          element={<LegacyStaffRedirect />}
        />

        {/* Staff Legacy Dev Route — bypasses auth, kept for backward compatibility */}
        <Route
          path="/staff/*"
          element={<StaffAppShell />}
        />

        {/* Catch-all fallback */}
        <Route
          path="*"
          element={<Navigate to="/" replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
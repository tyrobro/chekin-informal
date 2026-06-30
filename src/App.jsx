import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import LoginScreen from './features/event-dashboard/auth/LoginScreen.jsx';
import EventDashboard from './features/event-dashboard/prepare-sync/EventDashboard.jsx';
import StaffAppShell from './features/staff/StaffAppShell.jsx';

/**
 * DevStaffShortcut — DEV ONLY component.
 * Renders StaffAppShell with a synthetic token that bypasses magic link validation.
 * 
 * Usage (requires a valid token from the checkin_staff table):
 *   http://localhost:5173/dev/staff?token=<any_valid_invite_token>
 * 
 * Or use without token to see the missing_token screen (useful for UI testing).
 * This simply redirects to /staff with the same query params.
 */
function DevStaffShortcut() {
  const [params] = useSearchParams();
  const token = params.get('token');
  
  // If a token is provided, redirect to the real staff route
  if (token) {
    window.location.href = `/staff?token=${token}`;
    return null;
  }

  // No token — show instructions
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-8">
      <div className="max-w-lg bg-slate-800 rounded-2xl p-8 border border-slate-700">
        <h1 className="text-xl font-bold text-[#7E57C2] mb-4">🛠 Dev Staff Login</h1>
        <p className="text-slate-300 text-sm mb-4">
          This route is only available in development. Pass a valid invite token:
        </p>
        <code className="block bg-slate-900 rounded-lg p-3 text-xs text-green-400 mb-4 break-all">
          /dev/staff?token=&lt;invite_token_from_checkin_staff_table&gt;
        </code>
        <p className="text-slate-500 text-xs">
          Get a token: open the Host Dashboard → Invite Staff → Copy Link → extract the token from the URL.
        </p>
      </div>
    </div>
  );
}

/**
 * App — root component.
 *
 * Routes:
 * - / : Reads auth token. No token → LoginScreen. Token → EventDashboard.
 * - /staff/* : Bypasses host auth, routes to Staff PWA logic (Magic Link).
 * - /dev/staff : DEV ONLY — direct access to staff interface with test params.
 *               Automatically disabled in production builds.
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
        
        {/* Staff Environment Boundary */}
        <Route 
          path="/staff/*" 
          element={<StaffAppShell />} 
        />

        {/* 
          DEV ONLY — Developer test login for Staff interface.
          Usage: http://localhost:5173/dev/staff?staffId=xxx&eventId=yyy&gate=Main+Gate&name=Dev+User
          This route bypasses magic link validation entirely.
          Automatically disabled in production builds (import.meta.env.DEV).
        */}
        {import.meta.env.DEV && (
          <Route 
            path="/dev/staff" 
            element={<DevStaffShortcut />} 
          />
        )}

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
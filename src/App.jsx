import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
// Corrected paths based on your directory structure:
import LoginScreen from './features/event-dashboard/auth/LoginScreen.jsx';
import EventDashboard from './features/event-dashboard/prepare-sync/EventDashboard.jsx';
import StaffAppShell from './features/staff/StaffAppShell.jsx';

/**
 * App — root component.
 *
 * Routes:
 * - / : Reads auth token. No token → LoginScreen. Token → EventDashboard.
 * - /staff/* : Bypasses host auth, routes to Staff PWA logic (Magic Link).
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
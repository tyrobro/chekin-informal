import { useAuth } from './context/AuthContext.jsx';
import LoginScreen from './features/auth/LoginScreen.jsx';
import EventDashboard from './features/prepare-sync/EventDashboard.jsx';

/**
 * App — root component.
 *
 * Reads the auth token from context:
 *   - No token → show LoginScreen (handles both step 1 and step 2 internally)
 *   - Token present → show EventDashboard
 */
function App() {
  const { token } = useAuth();
  return token ? <EventDashboard /> : <LoginScreen />;
}

export default App;

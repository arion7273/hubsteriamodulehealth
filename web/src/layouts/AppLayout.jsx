import { NavLink, Outlet } from 'react-router-dom';
import BackendBanner from '../components/BackendBanner.jsx';
import { useRegistry } from '../hooks/useRegistry.js';

export default function AppLayout() {
  const { apiOnline } = useRegistry();

  return (
    <div className="layout">
      <nav className="sidebar" aria-label="Main">
        <h1>Hubsteria Module Health</h1>
        <NavLink to="/">Landing</NavLink>
        <NavLink to="/overview">Overview</NavLink>
        <NavLink to="/run">Run test</NavLink>
        <NavLink to="/reports">Reports</NavLink>
        <NavLink to="/schedules">Schedules</NavLink>
        <NavLink to="/settings">Settings</NavLink>
      </nav>
      <main>
        <BackendBanner apiOnline={apiOnline} />
        <Outlet />
      </main>
    </div>
  );
}

import { NavLink, Outlet } from 'react-router-dom';

export default function AppLayout() {
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
        <Outlet />
      </main>
    </div>
  );
}

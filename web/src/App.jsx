import { NavLink, Route, Routes } from 'react-router-dom';
import Overview from './pages/Overview.jsx';
import AppDetail from './pages/AppDetail.jsx';
import RunTest from './pages/RunTest.jsx';
import Reports from './pages/Reports.jsx';
import ReportDetail from './pages/ReportDetail.jsx';
import Schedules from './pages/Schedules.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  return (
    <div className="layout">
      <nav className="sidebar" aria-label="Main">
        <h1>Hubsteria Module Health</h1>
        <NavLink to="/" end>Overview</NavLink>
        <NavLink to="/run">Run test</NavLink>
        <NavLink to="/reports">Reports</NavLink>
        <NavLink to="/schedules">Schedules</NavLink>
        <NavLink to="/settings">Settings</NavLink>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/apps/:appId" element={<AppDetail />} />
          <Route path="/run" element={<RunTest />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/reports/:runId" element={<ReportDetail />} />
          <Route path="/schedules" element={<Schedules />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}

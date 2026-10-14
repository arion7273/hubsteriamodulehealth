import { Route, Routes } from 'react-router-dom';
import AppLayout from './layouts/AppLayout.jsx';
import Landing from './pages/Landing.jsx';
import Overview from './pages/Overview.jsx';
import AppDetail from './pages/AppDetail.jsx';
import RunTest from './pages/RunTest.jsx';
import Reports from './pages/Reports.jsx';
import ReportDetail from './pages/ReportDetail.jsx';
import Schedules from './pages/Schedules.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route element={<AppLayout />}>
        <Route path="/overview" element={<Overview />} />
        <Route path="/apps/:appId" element={<AppDetail />} />
        <Route path="/run" element={<RunTest />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/reports/:runId" element={<ReportDetail />} />
        <Route path="/schedules" element={<Schedules />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

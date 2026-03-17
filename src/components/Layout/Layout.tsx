import { Outlet, useLocation } from 'react-router-dom';
import ContextPanelSlot from './ContextPanelSlot';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

export default function Layout() {
  const { pathname } = useLocation();
  const hideContextPanel = pathname === '/portfolio';

  return (
    <div className="layout">
      <Sidebar />
      <div className={`main-area${pathname.startsWith('/execution') ? ' main-area--execution' : ''}`}>
        <TopBar />
        <div className="workspace-shell">
          <main className={`content${pathname.startsWith('/execution') ? ' content--execution' : ''}`}>
            <Outlet />
          </main>
          {!hideContextPanel ? <ContextPanelSlot /> : null}
        </div>
        <footer className="page-footer">A股量化终端</footer>
      </div>
    </div>
  );
}

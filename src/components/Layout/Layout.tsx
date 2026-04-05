import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import type { StockDetail } from '../../types/stock';
import StockDrawer from '../Drawer/StockDrawer';
import ContextPanelSlot from './ContextPanelSlot';
import Sidebar from './Sidebar';
import StatusBar from './StatusBar';
import TopBar from './TopBar';

export default function Layout() {
  const { pathname } = useLocation();
  const hideContextPanel = pathname === '/portfolio' || pathname === '/weak-buy' || pathname === '/ignition' || pathname === '/retoc2' || pathname === '/pattern' || pathname === '/ml-select';
  const [drawerStock, setDrawerStock] = useState<StockDetail | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.tsCode) {
        setDrawerStock({
          code: detail.tsCode,
          name: detail.name || detail.tsCode,
          close: 0,
          changePct: 0,
          lists: [],
          dims: [],
          gates: [],
        });
      }
    };
    window.addEventListener('open-stock-drawer', handler);
    return () => window.removeEventListener('open-stock-drawer', handler);
  }, []);

  return (
    <div className="layout">
      <Sidebar />
      <div className={`main-area${pathname.startsWith('/execution') ? ' main-area--execution' : ''}${pathname.startsWith('/risk') ? ' main-area--risk' : ''}`}>
        <TopBar />
        <div className="workspace-shell">
          <main className={`content${pathname.startsWith('/execution') ? ' content--execution' : ''}${pathname.startsWith('/risk') ? ' content--risk' : ''}`}>
            <Outlet />
          </main>
          {!hideContextPanel ? <ContextPanelSlot /> : null}
        </div>
        <footer className="page-footer">A股量化终端</footer>
      </div>
      <StockDrawer stock={drawerStock} onClose={() => setDrawerStock(null)} />
      <StatusBar />
    </div>
  );
}

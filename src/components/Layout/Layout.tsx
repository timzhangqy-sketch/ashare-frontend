import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import type { StockDetail } from '../../types/stock';
import StockDrawer from '../Drawer/StockDrawer';
import ContextPanelSlot from './ContextPanelSlot';
import StockDrawer from '../Drawer/StockDrawer';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import type { StockDetail } from '../../types/stock';

export default function Layout() {
  const { pathname } = useLocation();
  const hideContextPanel = pathname === '/portfolio';
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
    </div>
  );
}

import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  legacyNavigation,
  mainNavigation,
  type AppRouteDefinition,
  type NavIconKey,
} from '../../config/navigation';

const IconDashboard = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <rect x="3" y="3" width="8" height="8" rx="2" />
    <rect x="13" y="3" width="8" height="5" rx="2" />
    <rect x="13" y="10" width="8" height="11" rx="2" />
    <rect x="3" y="13" width="8" height="8" rx="2" />
  </svg>
);

const IconSignals = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <path d="M4 18L10 12L14 15L20 7" />
    <path d="M20 7H15" />
    <path d="M20 7V12" />
  </svg>
);

const IconWatchlist = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <path d="M4 5h16" />
    <path d="M4 12h10" />
    <path d="M4 19h16" />
    <circle cx="18" cy="12" r="2" />
  </svg>
);

const IconPortfolio = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    <line x1="12" y1="12" x2="12" y2="12" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </svg>
);

const IconExecution = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <path d="M5 12h8" />
    <path d="M13 8l4 4-4 4" />
    <path d="M4 5h10" />
    <path d="M4 19h16" />
  </svg>
);

const IconRisk = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <path d="M12 3L21 19H3L12 3z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </svg>
);

const IconResearch = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
    <line x1="2" y1="20" x2="22" y2="20" />
  </svg>
);

const IconSystem = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.33 1V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1-.6 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1-.33H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0 .6-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .33-1V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1 .6 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.15.32.23.66.24 1.01.01.35-.05.69-.18 1.01.13.32.19.66.18 1.01-.01.35-.09.69-.24 1.01z" />
  </svg>
);

const IconLegacy = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <path d="M7 7h10v10" />
    <path d="M7 17L17 7" />
    <path d="M5 5h6" />
    <path d="M5 5v6" />
  </svg>
);

const ICONS: Record<NavIconKey, () => React.JSX.Element> = {
  dashboard: IconDashboard,
  signals: IconSignals,
  watchlist: IconWatchlist,
  portfolio: IconPortfolio,
  execution: IconExecution,
  risk: IconRisk,
  research: IconResearch,
  system: IconSystem,
  legacy: IconLegacy,
};

function getItemCopy(item: AppRouteDefinition) {
  return {
    label: item.label,
    description: item.description,
  };
}

function NavItemLink({ item }: { item: AppRouteDefinition }) {
  const Icon = ICONS[item.icon ?? 'legacy'];
  const copy = getItemCopy(item);
  const isLegacyHidden = item.key === 'holdings' || item.key === 'backtest';

  return (
    <NavLink
      to={item.path}
      className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
      style={isLegacyHidden ? { display: 'none' } : undefined}
    >
      <span className="nav-icon"><Icon /></span>
      <span className="nav-label-wrap">
        <span className="nav-label">{copy.label}</span>
        <span className="nav-badge">{copy.description}</span>
      </span>
    </NavLink>
  );
}

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">AQ</div>
        <div>
          <div className="sidebar-logo-text">A股量化终端</div>
          <div className="sidebar-logo-sub">专业终端工作台</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {mainNavigation.map((item) => (
          <NavItemLink key={item.key} item={item} />
        ))}

        <div className="nav-section-label nav-section-label-spaced">策略专页</div>
        {legacyNavigation.map((item) => (
          <NavItemLink key={item.key} item={item} />
        ))}
      </nav>

      <div className="sidebar-footer">
        <span><span className="status-dot" />专业终端基线</span>
        <span>v0.1.0</span>
      </div>
    </aside>
  );
}

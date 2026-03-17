import type { RiskTab, RiskTabMeta } from '../../types/risk';

interface RiskTabsProps {
  activeTab: RiskTab;
  tabs: Record<RiskTab, RiskTabMeta>;
  onChange: (tab: RiskTab) => void;
}

export default function RiskTabs({ activeTab, tabs, onChange }: RiskTabsProps) {
  return (
    <div className="page-tabs risk-tabs">
      {(['gate', 'scores', 'breakdown', 'events'] as RiskTab[]).map((tab) => (
        <button
          key={tab}
          type="button"
          className={`page-tab-btn${activeTab === tab ? ' active' : ''}`}
          onClick={() => onChange(tab)}
        >
          {tabs[tab].label}
        </button>
      ))}
    </div>
  );
}

import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import RiskDefenseOverview from '../../components/risk/RiskDefenseOverview';
import RiskDetailView from '../../components/risk/RiskDetailView';
import RiskFlowChart from '../../components/risk/RiskFlowChart';
import { useContextPanel } from '../../context/useContextPanel';

export default function RiskPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { closePanel } = useContextPanel();

  const rawTab = searchParams.get('tab');
  const source = searchParams.get('source');
  const isOverviewTab = rawTab === 'overview' || (!rawTab && !source);
  const isDetailTab = rawTab === 'detail' || (!!source && rawTab !== 'overview');

  // Close context panel on overview tab
  useEffect(() => {
    if (isOverviewTab) closePanel();
  }, [isOverviewTab, closePanel]);

  useEffect(() => () => closePanel(), [closePanel]);

  const setTab = (tab: 'overview' | 'detail') => {
    const next = new URLSearchParams();
    if (tab === 'detail') next.set('tab', 'detail');
    else next.set('tab', 'overview');
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="risk-page" data-testid="risk-page">
      <div style={{ display: 'flex', gap: 0, marginBottom: 12 }}>
        <button
          type="button"
          className={`page-tab-btn${isOverviewTab ? ' active' : ''}`}
          onClick={() => setTab('overview')}
          style={{ fontSize: 13, padding: '8px 16px' }}
        >风控总览</button>
        <button
          type="button"
          className={`page-tab-btn${isDetailTab ? ' active' : ''}`}
          onClick={() => setTab('detail')}
          style={{ fontSize: 13, padding: '8px 16px' }}
        >风控明细</button>
      </div>

      {isOverviewTab ? (
        <>
          <RiskDefenseOverview />
          <RiskFlowChart />
        </>
      ) : <RiskDetailView />}
    </div>
  );
}

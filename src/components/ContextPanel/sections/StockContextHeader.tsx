import { MultiStrategyBadge } from '../../CrossTags';
import type { ContextPanelSourcePage } from '../../../types/contextPanel';
import { getStrategyDisplayName } from '../../../utils/displayNames';
import { useState } from 'react';
import { BarChart2 } from 'lucide-react';

function getKicker(sourcePage: ContextPanelSourcePage) {
  if (sourcePage === 'signals') return '股票详情'
  return ''
}

interface StockContextHeaderProps {
  name: string;
  tsCode: string;
  sourcePage: ContextPanelSourcePage;
  sourceStrategy?: string | null;
  primaryConcept?: string | null;
  isLeader?: boolean;
}

export default function StockContextHeader({
  name,
  tsCode,
  sourcePage,
  sourceStrategy,
  primaryConcept,
  isLeader,
}: StockContextHeaderProps) {
  const kicker = getKicker(sourcePage)
  const [klineHover, setKlineHover] = useState(false)

  return (
    <header className="global-context-stock-header">
      {kicker ? <div className="context-panel-kicker">{kicker}</div> : null}
      <div className="global-context-stock-title-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="global-context-stock-title-group">
          <div className="global-context-stock-name">{name}</div>
          <div className="global-context-stock-code">{tsCode}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            title="K线详情"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              color: klineHover ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
            onMouseEnter={() => setKlineHover(true)}
            onMouseLeave={() => setKlineHover(false)}
            onClick={() => {
              window.dispatchEvent(new CustomEvent('open-stock-drawer', { detail: { tsCode, name } }))
            }}
          >
            <BarChart2 size={18} />
          </button>
          <MultiStrategyBadge tsCode={tsCode} />
        </div>
      </div>
      <div className="global-context-stock-meta">
        {sourceStrategy ? <span className="context-panel-tag">{getStrategyDisplayName(sourceStrategy) || sourceStrategy}</span> : null}
        {primaryConcept ? <span className="context-panel-tag context-tag-concept">{primaryConcept}{isLeader ? ' 👑' : ''}</span> : null}
      </div>
    </header>
  );
}

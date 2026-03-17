import { useState } from 'react';
import { BarChart2 } from 'lucide-react';
import { MultiStrategyBadge } from '../../CrossTags';
import type { ContextPanelSourcePage } from '../../../types/contextPanel';
import { getStrategyDisplayName } from '../../../utils/displayNames';

function getSourceLabel(sourcePage: ContextPanelSourcePage) {
  if (sourcePage === 'signals') return '当前工作台';
  if (sourcePage === 'watchlist') return '来自交易标的池';
  if (sourcePage === 'portfolio') return '来自持仓中心';
  if (sourcePage === 'risk') return '来自风控中心';
  if (sourcePage === 'research') return '来自研究中心';
  if (sourcePage === 'system') return '来自系统运行中心';
  if (sourcePage === 'execution') return '来自模拟执行';
  if (sourcePage === 'dashboard') return '来自 Dashboard';
  return '直接进入';
}

function getKicker(sourcePage: ContextPanelSourcePage) {
  if (sourcePage === 'signals') return '股票详情'
  return ''
}

interface StockContextHeaderProps {
  name: string;
  tsCode: string;
  sourcePage: ContextPanelSourcePage;
  sourceStrategy?: string | null;
}

export default function StockContextHeader({
  name,
  tsCode,
  sourcePage,
  sourceStrategy,
}: StockContextHeaderProps) {
  const [klineBtnHover, setKlineBtnHover] = useState(false);
  void getSourceLabel(sourcePage);

  return (
    <header className="global-context-stock-header">
      <div className="context-panel-kicker">{getKicker(sourcePage)}</div>
      <div className="global-context-stock-title-row">
        <div className="global-context-stock-title-group">
          <div className="global-context-stock-name" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{name}</span>
            <button
              type="button"
              title="K线详情"
              onMouseEnter={() => setKlineBtnHover(true)}
              onMouseLeave={() => setKlineBtnHover(false)}
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent('open-stock-drawer', { detail: { tsCode, name } }),
                )
              }
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                color: klineBtnHover ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              <BarChart2 size={18} />
            </button>
          </div>
          <div className="global-context-stock-code">{tsCode}</div>
        </div>
        <MultiStrategyBadge tsCode={tsCode} />
      </div>
      <div className="global-context-stock-meta">
        {sourceStrategy ? <span className="context-panel-tag">{getStrategyDisplayName(sourceStrategy) || sourceStrategy}</span> : null}
      </div>
    </header>
  );
}

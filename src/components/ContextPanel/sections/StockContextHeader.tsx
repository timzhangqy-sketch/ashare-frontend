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
  return '全局上下文'
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
  return (
    <header className="global-context-stock-header">
      <div className="context-panel-kicker">{getKicker(sourcePage)}</div>
      <div className="global-context-stock-title-row">
        <div className="global-context-stock-title-group">
          <div className="global-context-stock-name">{name}</div>
          <div className="global-context-stock-code">{tsCode}</div>
        </div>
        <MultiStrategyBadge tsCode={tsCode} />
      </div>
      <div className="global-context-stock-meta">
        <span className="context-panel-tag">{getSourceLabel(sourcePage)}</span>
        {sourceStrategy ? <span className="context-panel-tag">{getStrategyDisplayName(sourceStrategy) || sourceStrategy}</span> : null}
      </div>
    </header>
  );
}

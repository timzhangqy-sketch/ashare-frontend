import type { StockDetailResp } from '../../../api';
import { displaySignalLabel } from '../../../utils/labelMaps';

interface StockContextBaseInfoProps {
  detail: StockDetailResp | null;
  loading: boolean;
  summaryItems: Array<{
    label: string;
    value: string;
  }>;
}

function buildDetailItems(detail: StockDetailResp | null): Array<{ label: string; value: string; color?: string }> {
  if (!detail) return [];

  const pctColor = detail.pct_chg != null
    ? detail.pct_chg > 0 ? 'var(--up)' : detail.pct_chg < 0 ? 'var(--down)' : undefined
    : undefined;

  return [
    {
      label: '最新价',
      value: detail.close != null ? detail.close.toFixed(2) : '--',
    },
    {
      label: '涨跌幅',
      value: detail.pct_chg != null ? `${detail.pct_chg > 0 ? '+' : ''}${detail.pct_chg.toFixed(2)}%` : '--',
      color: pctColor,
    },
    {
      label: '行业',
      value: detail.industry ?? '--',
    },
    {
      label: '换手率',
      value: detail.turnover_rate != null ? `${detail.turnover_rate.toFixed(2)}%` : '--',
    },
    {
      label: '交易标的池',
      value: detail.in_watchlist ? '已在交易标的池' : '未进入交易标的池',
    },
    {
      label: '买卖信号',
      value:
        detail.watchlist_buy_signal || detail.watchlist_sell_signal
          ? [detail.watchlist_buy_signal, detail.watchlist_sell_signal].filter(Boolean).map(displaySignalLabel).join(' / ')
          : '暂无信号',
    },
  ];
}

export default function StockContextBaseInfo({
  detail,
  loading,
  summaryItems,
}: StockContextBaseInfoProps) {
  const items = buildDetailItems(detail);
  const displayItems = items.length ? items : summaryItems;

  return (
    <section className="global-context-section">
      <div className="global-context-section-title">基础信息</div>
      {loading ? (
        <div className="global-context-empty">正在加载股票基础信息...</div>
      ) : displayItems.length ? (
        <div className="global-context-stat-grid">
          {displayItems.map(item => (
            <div key={item.label} className="global-context-stat-card">
              <span>{item.label}</span>
              <strong style={'color' in item && item.color ? { color: item.color as string } : undefined}>{item.value}</strong>
            </div>
          ))}
        </div>
      ) : (
        <div className="global-context-empty">当前没有可展示的基础信息。</div>
      )}
    </section>
  );
}

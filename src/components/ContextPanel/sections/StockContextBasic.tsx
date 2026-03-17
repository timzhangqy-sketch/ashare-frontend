import type { StockContextMainData } from '../../../types/contextPanel';

interface StockContextBasicProps {
  data: StockContextMainData | null;
  loading: boolean;
  summaryItems: Array<{ label: string; value: string }>;
}

export default function StockContextBasic({ data, loading, summaryItems }: StockContextBasicProps) {
  if (loading) {
    return (
      <section className="global-context-section">
        <div className="global-context-section-title">基础信息</div>
        <div className="global-context-empty">正在加载基础信息...</div>
      </section>
    );
  }

  const pctColor = data?.pctChg != null
    ? data.pctChg > 0 ? 'var(--up)' : data.pctChg < 0 ? 'var(--down)' : undefined
    : undefined;

  const detailItems: Array<{ label: string; value: string; color?: string }> = data
    ? [
        { label: '最新价', value: data.close != null ? data.close.toFixed(2) : '--' },
        { label: '涨跌幅', value: data.pctChg != null ? `${data.pctChg > 0 ? '+' : ''}${data.pctChg.toFixed(2)}%` : '--', color: pctColor },
        { label: '行业', value: data.industry ?? '--' },
        { label: '换手率', value: data.turnoverRate != null ? `${data.turnoverRate.toFixed(2)}%` : '--' },
      ]
    : summaryItems;

  return (
    <section className="global-context-section">
      <div className="global-context-section-title">基础信息</div>
      <div className="global-context-stat-grid">
        {detailItems.map(item => (
          <div key={item.label} className="global-context-stat-card">
            <span>{item.label}</span>
            <strong style={'color' in item && item.color ? { color: item.color as string } : undefined}>{item.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

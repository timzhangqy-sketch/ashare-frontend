import type { StockContextKlineData, ContextPanelLoadStatus } from '../../../types/contextPanel';

interface StockContextKlineProps {
  status: ContextPanelLoadStatus;
  note: string;
  data: StockContextKlineData | null;
}

function formatCloseSeries(values: number[]) {
  if (!values.length) return '--';
  return values.map(value => value.toFixed(2)).join(' / ');
}

export default function StockContextKline({ status, note, data }: StockContextKlineProps) {
  if (status === 'empty' && !data) return null;

  return (
    <section className="global-context-section">
      <div className="global-context-section-title">K线</div>
      <div className="global-context-inline-note">{note}</div>
      {status === 'loading' ? (
        <div className="global-context-empty">正在加载 K 线...</div>
      ) : data ? (
        <div className="global-context-stat-grid">
          <div className="global-context-stat-card">
            <span>最新日期</span>
            <strong>{data.latestDate ?? '--'}</strong>
          </div>
          <div className="global-context-stat-card">
            <span>收盘 / 开盘</span>
            <strong>
              {data.latestClose != null ? data.latestClose.toFixed(2) : '--'} / {data.latestOpen != null ? data.latestOpen.toFixed(2) : '--'}
            </strong>
          </div>
          <div className="global-context-stat-card">
            <span>最高 / 最低</span>
            <strong>
              {data.latestHigh != null ? data.latestHigh.toFixed(2) : '--'} / {data.latestLow != null ? data.latestLow.toFixed(2) : '--'}
            </strong>
          </div>
          <div className="global-context-stat-card">
            <span>近五日收盘</span>
            <strong>{formatCloseSeries(data.lastFiveCloses)}</strong>
          </div>
        </div>
      ) : (
        <div className="global-context-empty">当前没有可展示的 K 线摘要。</div>
      )}
    </section>
  );
}

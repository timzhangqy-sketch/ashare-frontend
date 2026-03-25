import { useState, useEffect } from 'react';

interface StatusBarData {
  pipelineStatus: string;
  totalNav: number | null;
  dailyPnl: number | null;
  dailyPnlPct: number | null;
  apiLatency: number | null;
  lastUpdate: string | null;
}

export default function StatusBar() {
  const [data, setData] = useState<StatusBarData>({
    pipelineStatus: 'unknown',
    totalNav: null,
    dailyPnl: null,
    dailyPnlPct: null,
    apiLatency: null,
    lastUpdate: null,
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch portfolio summary
        const t0 = performance.now();
        const [summaryRes, portfolioRes] = await Promise.all([
          fetch('/api/dashboard/summary'),
          fetch('/api/portfolio/summary'),
        ]);
        const apiLatency = Math.round(performance.now() - t0);

        const summary = await summaryRes.json();
        const portfolio = await portfolioRes.json();

        setData({
          pipelineStatus: summary?.system_health?.pipeline_status || 'unknown',
          totalNav: portfolio?.snapshot?.total_nav || null,
          dailyPnl: portfolio?.snapshot?.daily_pnl || null,
          dailyPnlPct: portfolio?.snapshot?.daily_pnl_pct || null,
          apiLatency,
          lastUpdate: summary?.system_health?.latest_success_time || null,
        });
      } catch {
        setData(prev => ({ ...prev, pipelineStatus: 'error' }));
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 60000); // refresh every 60s
    return () => clearInterval(interval);
  }, []);

  const formatCurrency = (val: number | null) => {
    if (val === null || val === undefined) return '—';
    return '¥' + val.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatPnl = (pnl: number | null, pct: number | null) => {
    if (pnl === null && pct === null) return '—';
    const sign = (pnl ?? 0) >= 0 ? '+' : '';
    const pnlStr = pnl !== null ? `${sign}¥${Math.abs(pnl).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
    const pctStr = pct !== null ? `(${sign}${(pct * 100).toFixed(2)}%)` : '';
    return `${pnlStr} ${pctStr}`.trim();
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '—';
    }
  };

  const pnlColor = (val: number | null) => {
    if (val === null || val === 0) return 'status-bar-neutral';
    return val > 0 ? 'status-bar-up' : 'status-bar-down';
  };

  const statusDot = data.pipelineStatus === 'ok' ? 'status-dot-ok' :
                    data.pipelineStatus === 'error' ? 'status-dot-error' : 'status-dot-warn';

  const statusText = data.pipelineStatus === 'ok' ? '系统正常 ONLINE' :
                     data.pipelineStatus === 'error' ? '系统异常 ERROR' : '状态未知 UNKNOWN';

  return (
    <footer className="status-bar">
      <div className="status-bar-left">
        <span className="status-bar-item">
          <span className={`status-dot ${statusDot}`}></span>
          <span className="status-bar-label">{statusText}</span>
        </span>
        <span className="status-bar-item">
          <span className="status-bar-label">API</span>
          <span className="status-bar-value">{data.apiLatency !== null ? `${data.apiLatency}ms` : '—'}</span>
        </span>
      </div>
      <div className="status-bar-right">
        <span className="status-bar-item">
          <span className="status-bar-label">总资产 NAV</span>
          <span className="status-bar-value">{formatCurrency(data.totalNav)}</span>
        </span>
        <span className="status-bar-divider"></span>
        <span className="status-bar-item">
          <span className="status-bar-label">今日盈亏 P&L</span>
          <span className={`status-bar-value ${pnlColor(data.dailyPnl)}`}>
            {formatPnl(data.dailyPnl, data.dailyPnlPct)}
          </span>
        </span>
        <span className="status-bar-divider"></span>
        <span className="status-bar-item">
          <span className="status-bar-label">更新</span>
          <span className="status-bar-value">{formatTime(data.lastUpdate)}</span>
        </span>
      </div>
    </footer>
  );
}

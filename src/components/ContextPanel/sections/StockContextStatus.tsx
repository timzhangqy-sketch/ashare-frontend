import type { StockContextRiskData, StockContextLifecycleData } from '../../../types/contextPanel'
// displaySignalLabel available if needed

function fmtRatio(v: number | null | undefined) { return v == null || Number.isNaN(v) ? '--' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%` }
function pctCls(v: number | null | undefined) { return (v ?? 0) > 0 ? 'c-up' : (v ?? 0) < 0 ? 'c-down' : '' }

function DimRow({ label, score }: { label: string; score: number | null }) {
  const s = score ?? 0
  const fillCls = s >= 80 ? 'dim-fill-green' : s >= 60 ? 'dim-fill-yellow' : 'dim-fill-red'
  return (
    <div className="ctx-dim-row">
      <span className="dim-label">{label}</span>
      <div className="dim-bar"><div className={`dim-fill ${fillCls}`} style={{ width: `${Math.min(s, 100)}%` }} /></div>
      <span className="dim-score numeric">{score != null ? score.toFixed(0) : '--'}</span>
    </div>
  )
}

interface Props {
  risk: StockContextRiskData | null
  lifecycle: StockContextLifecycleData | null
  loading: boolean
}

export default function StockContextStatus({ risk, lifecycle, loading }: Props) {
  if (loading) return <div className="global-context-section"><div className="global-context-empty">加载中...</div></div>

  return (
    <div className="ctx-status-section">
      <div className="global-context-section-title" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 4 }}>系统状态</div>

      {/* Risk */}
      {risk ? (
        <div className="ctx-risk-mini">
          <div className="ctx-risk-header">
            <span className={`risk-score-big numeric ${(risk.riskScoreTotal ?? 0) >= 70 ? 'c-up' : ''}`}>
              {risk.riskScoreTotal != null ? risk.riskScoreTotal.toFixed(1) : '--'}
            </span>
            <span className={`risk-badge risk-badge-${risk.riskLevel === 'low' ? 'low' : risk.riskLevel === 'medium' ? 'medium' : 'high'}`}>
              {risk.riskLevel === 'low' ? '低' : risk.riskLevel === 'medium' ? '中' : risk.riskLevel === 'high' ? '高' : risk.riskLevel ?? '--'}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {risk.tradeAllowed ? '✅允许' : `🚫${risk.blockReason ?? '限制'}`}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              仓位 {risk.capMultiplier != null ? `${risk.capMultiplier.toFixed(2)}x` : '--'}
            </span>
          </div>
          <DimRow label="财务" score={risk.riskScoreFinancial} />
          <DimRow label="市场" score={risk.riskScoreMarket} />
          <DimRow label="事件" score={risk.riskScoreEvent} />
          <DimRow label="合规" score={risk.riskScoreCompliance} />
        </div>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>暂无风控</div>
      )}

      <div className="ctx-divider" />

      {/* Lifecycle */}
      {lifecycle ? (
        <div className="ctx-lc-grid">
          <div className="ctx-lc-cell"><div className="lc-label">阶段</div><div className="lc-value">{lifecycle.lifecycleLabel}</div></div>
          <div className="ctx-lc-cell"><div className="lc-label">天数</div><div className="lc-value numeric">{lifecycle.poolDay ?? '--'}</div></div>
          <div className="ctx-lc-cell"><div className="lc-label">入池收益</div><div className={`lc-value numeric ${pctCls(lifecycle.gainSinceEntry)}`}>{fmtRatio(lifecycle.gainSinceEntry)}</div></div>
          <div className="ctx-lc-cell"><div className="lc-label">状态</div><div className="lc-value">{lifecycle.positionStatus ?? '--'}</div></div>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>未入池</div>
      )}
    </div>
  )
}

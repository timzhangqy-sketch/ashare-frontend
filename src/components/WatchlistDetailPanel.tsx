import WatchlistStatusBadge from './WatchlistStatusBadge'
import type { StockContextViewModel } from '../types/contextPanel'
import type { WatchlistActionVm, WatchlistRowVm } from '../types/watchlist'
import { getStrategyDisplayName } from '../utils/displayNames'

function formatSignedPercent(value: number | null | undefined, decimal = false): string {
  if (value == null) return '--'
  const parsed = decimal ? value * 100 : value
  return `${parsed > 0 ? '+' : ''}${parsed.toFixed(2)}%`
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value == null) return '--'
  return value.toFixed(digits)
}

interface WatchlistDetailPanelProps {
  selectedRow: WatchlistRowVm
  selectedContext: StockContextViewModel | null
  selectedContextLoading: boolean
  onAction: (row: WatchlistRowVm, action: WatchlistActionVm) => void
}

export default function WatchlistDetailPanel({
  selectedRow,
  selectedContext,
  selectedContextLoading,
  onAction,
}: WatchlistDetailPanelProps) {
  const hasRiskData = selectedContext?.risk.data != null
  const hasLifecycleData = selectedContext?.lifecycle.data != null

  return (
    <div data-testid="watchlist-detail-panel">
      <div className="watchlist-context-head">
        <div className="watchlist-context-title">{selectedRow.name}</div>
        <div className="watchlist-context-code numeric-muted">{selectedRow.tsCode}</div>
      </div>

      <div className="watchlist-context-primary">
        <WatchlistStatusBadge status={selectedRow.lifecycleStatus} />
        <span className="watchlist-mini-pill active">{getStrategyDisplayName(selectedRow.strategy) || selectedRow.strategy}</span>
        <span className={`watchlist-mini-pill${selectedRow.inPortfolio ? ' active' : ''}`}>
          {selectedRow.inPortfolio ? '已转入持仓' : '仍在交易标的池'}
        </span>
        <span className="watchlist-mini-pill active">{selectedRow.signalLabel}</span>
      </div>

      <div className="watchlist-context-grid">
        <div className="watchlist-context-stat">
          <span>观察天数</span>
          <strong className="numeric">{selectedRow.poolDay}</strong>
        </div>
        <div className="watchlist-context-stat">
          <span>最新涨跌幅</span>
          <strong className="numeric">{formatSignedPercent(selectedRow.latestPctChg)}</strong>
        </div>
        <div className="watchlist-context-stat">
          <span>入池以来收益</span>
          <strong className="numeric">{formatSignedPercent(selectedRow.gainSinceEntry, true)}</strong>
        </div>
        <div className="watchlist-context-stat">
          <span>交叉策略数</span>
          <strong className="numeric">{selectedRow.crossStrategyCount}</strong>
        </div>
      </div>

      <div className="watchlist-context-section">
        <div className="watchlist-context-label">观察判断</div>
        <div className="watchlist-context-summary-list">
          <div className="watchlist-context-summary-item">
            <span>来源策略</span>
            <strong>{getStrategyDisplayName(selectedRow.sourceStrategyPrimary) || selectedRow.sourceStrategyPrimary}</strong>
          </div>
          <div className="watchlist-context-summary-item">
            <span>买卖信号</span>
            <strong>
              {selectedRow.buySignal ?? '--'} / {selectedRow.sellSignal ?? '--'}
            </strong>
          </div>
          <div className="watchlist-context-summary-item">
            <span>承接状态</span>
            <strong>{selectedRow.transferredToPortfolio ? '已转入持仓' : '仍在交易标的池'}</strong>
          </div>
          <div className="watchlist-context-summary-item">
            <span>下一步建议</span>
            <strong>{selectedRow.nextAction}</strong>
          </div>
        </div>
      </div>

      <div className="watchlist-context-section" data-testid="watchlist-stock-context-section">
        <div className="watchlist-context-label">股票上下文</div>
        {selectedContextLoading ? (
          <div className="watchlist-context-empty">正在加载股票上下文…</div>
        ) : (
          <div className="watchlist-context-summary-list">
            <div className="watchlist-context-summary-item">
              <span>最新价</span>
              <strong className="numeric">{formatNumber(selectedContext?.main?.close ?? selectedRow.latestClose)}</strong>
            </div>
            <div className="watchlist-context-summary-item">
              <span>涨跌幅</span>
              <strong className="numeric">{formatSignedPercent(selectedContext?.main?.pctChg ?? selectedRow.latestPctChg)}</strong>
            </div>
            <div className="watchlist-context-summary-item">
              <span>行业</span>
              <strong>{selectedContext?.main?.industry ?? '--'}</strong>
            </div>
            <div className="watchlist-context-summary-item">
              <span>换手率</span>
              <strong className="numeric">
                {selectedContext?.main?.turnoverRate != null ? `${selectedContext.main.turnoverRate.toFixed(2)}%` : '--'}
              </strong>
            </div>
          </div>
        )}
      </div>

      {hasRiskData ? (
        <div className="watchlist-context-section">
          <div className="watchlist-context-label">风险摘要</div>
          <div className="watchlist-context-summary-list">
            <div className="watchlist-context-summary-item">
              <span>风险分</span>
              <strong className="numeric">{formatNumber(selectedContext?.risk.data?.riskScoreTotal)}</strong>
            </div>
            <div className="watchlist-context-summary-item">
              <span>交易状态</span>
              <strong>{selectedContext?.risk.data?.tradeAllowed == null ? '--' : selectedContext.risk.data.tradeAllowed ? '已开启' : '未开启'}</strong>
            </div>
            <div className="watchlist-context-summary-item">
              <span>限制原因</span>
              <strong>{selectedContext?.risk.data?.blockReason ?? '--'}</strong>
            </div>
          </div>
        </div>
      ) : null}

      {hasLifecycleData ? (
        <div className="watchlist-context-section">
          <div className="watchlist-context-label">生命周期</div>
          <div className="watchlist-context-summary-list">
            <div className="watchlist-context-summary-item">
              <span>当前阶段</span>
              <strong>{selectedContext?.lifecycle.data?.lifecycleLabel ?? '--'}</strong>
            </div>
            <div className="watchlist-context-summary-item">
              <span>观察天数</span>
              <strong>{selectedContext?.lifecycle.data?.poolDay == null ? '--' : `${selectedContext.lifecycle.data.poolDay}`}</strong>
            </div>
          </div>
        </div>
      ) : null}

      <div className="watchlist-context-section">
        <div className="watchlist-context-label">动作承接</div>
        <div className="watchlist-context-actions">
          {selectedRow.availableActions.map((action) => (
            <button
              key={`${selectedRow.id}-${action.key}`}
              type="button"
              className={`watchlist-action-chip ${action.kind}`}
              disabled={action.disabled}
              onClick={() => onAction(selectedRow, action)}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

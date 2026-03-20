import type { StockContextViewModel } from '../types/contextPanel'
import { CandlestickChart, Minus, Plus, XCircle } from 'lucide-react'
import type {
  PortfolioActionShellVm,
  PortfolioContextLinkVm,
  PortfolioContextVm,
  PortfolioOpenRowVm,
  PortfolioClosedRowVm,
} from '../modules/portfolio/types'
import type { DataSourceMeta } from '../types/dataSource'
import { formatSignalReason } from '../utils/formatters'

const ACTION_SIGNAL_MAP: Record<string, string> = {
  TRAILING_STOP: '追踪止损', BREAKOUT: '突破信号', PULLBACK: '回调信号',
  STOP_LOSS: '止损出场', TAKE_PROFIT: '止盈出场', HOLD: '持续持有', EXIT: '主动退出',
}

const STRATEGY_LABEL_MAP: Record<string, string> = {
  VOL_SURGE: '连续放量蓄势', RETOC2: '异动反抽(RETOC2)',
  PATTERN_T2UP9: '形态策略(T2UP9)', WEAK_BUY: '弱市吸筹',
  PATTERN_GREEN10: '形态策略', GREEN10: '形态策略',
}

function fmt(v: number | null | undefined, d = 2) { return v == null ? '--' : v.toFixed(d) }
function fmtPct(v: number | null | undefined) { return v == null ? '--' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%` }
function pctCls(v: number | null | undefined) { return (v ?? 0) > 0 ? 'c-up' : (v ?? 0) < 0 ? 'c-down' : '' }

function Row({ label, value, cls }: { label: string; value: string | number; cls?: string }) {
  return (
    <div className="pf-detail-row">
      <span className="pf-label">{label}</span>
      <span className={`pf-value numeric ${cls ?? ''}`}>{value}</span>
    </div>
  )
}

function getFactValue(label: string, value: string | null | undefined): string {
  if (label === 'action_signal') return ACTION_SIGNAL_MAP[value ?? ''] ?? value ?? '--'
  if (label === 'signal_reason' || label === 'exit_reason') return formatSignalReason(value) ?? '--'
  if (label === 'execution_hint') return value || '等待后端接入'
  return value ?? '--'
}

const FACT_LABEL: Record<string, string> = {
  open_date: '建仓日期', open_price: '建仓价格', shares: '持仓数量', hold_days: '持有天数',
  unrealized_pnl: '浮动盈亏', unrealized_pnl_pct: '浮动收益率',
  realized_pnl: '已实现盈亏', realized_pnl_pct: '已实现收益率',
  action_signal: '当前信号', signal_reason: '原因说明', exit_reason: '退出说明',
  execution_hint: '动作建议', source_hint: '承接关系',
}

interface Props {
  activeContext: PortfolioContextVm
  activeRow: PortfolioOpenRowVm | PortfolioClosedRowVm | null
  detailSourceMeta?: DataSourceMeta
  stockContext: StockContextViewModel | null
  stockContextLoading: boolean
  onLink: (link: PortfolioContextLinkVm) => void
  onActionShell: (action: PortfolioActionShellVm) => void
  onOpenKline?: () => void
}

export default function PortfolioDetailPanel({
  activeContext,
  activeRow,
  detailSourceMeta: _detailSourceMeta,
  stockContext,
  stockContextLoading,
  onLink: _onLink,
  onActionShell: _onActionShell,
  onOpenKline,
}: Props) {
  const todayPct = activeRow && 'todayPnlPct' in activeRow ? activeRow.todayPnlPct : stockContext?.main?.pctChg

  return (
    <>
      {/* ═══ Header ═══ */}
      <div className="portfolio-context-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div className="portfolio-context-title">{activeContext.title}</div>
          <div className="portfolio-context-code numeric-muted">{activeContext.code}</div>
          <div className="portfolio-context-status">{activeContext.statusLabel}</div>
        </div>
      </div>

      {onOpenKline && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <button type="button" className="action-icon-btn" title="K线" onClick={onOpenKline}><CandlestickChart size={14} /></button>
          <button type="button" className="action-icon-btn" title="加仓" disabled><Plus size={14} /></button>
          <button type="button" className="action-icon-btn" title="减仓" disabled><Minus size={14} /></button>
          <button type="button" className="action-icon-btn" title="平仓" disabled><XCircle size={14} /></button>
        </div>
      )}

      {/* ═══ 持仓概览 ═══ */}
      <div className="pf-detail-section">
        <div className="pf-detail-title">持仓概览</div>
        <Row label="来源策略" value={STRATEGY_LABEL_MAP[activeRow?.sourceStrategy ?? ''] ?? activeContext.sourceStrategyLabel} />
        <Row label="承接关系" value={activeContext.sourceHint} />
        {activeContext.holdingFacts.map((item) => {
          const lbl = FACT_LABEL[item.label] ?? item.label
          const isPnl = item.label.includes('pnl')
          const numVal = isPnl ? parseFloat(item.value ?? '') : NaN
          return <Row key={item.label} label={lbl} value={item.value ?? '--'} cls={isPnl && !isNaN(numVal) ? pctCls(numVal) : ''} />
        })}
        {activeRow?.drawdownFromPeak != null && (
          <Row label="峰值回撤" value={`-${(activeRow.drawdownFromPeak * 100).toFixed(2)}%`} cls="c-down" />
        )}
      </div>

      <div className="pf-divider" />

      {/* ═══ 信号判断 ═══ */}
      <div className="pf-detail-section">
        <div className="pf-detail-title">信号判断</div>
        {activeContext.judgementFacts.map((item) => (
          <Row key={item.label} label={FACT_LABEL[item.label] ?? item.label} value={getFactValue(item.label, item.value)} />
        ))}
      </div>

      <div className="pf-divider" />

      {/* ═══ 股票上下文 ═══ */}
      <div className="pf-detail-section">
        <div className="pf-detail-title">股票上下文</div>
        {stockContextLoading ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 0' }}>加载中...</div>
        ) : (
          <>
            <Row label="最新价" value={fmt(activeRow?.latestClose ?? stockContext?.main?.close)} />
            <Row label="今日涨跌" value={fmtPct(todayPct)} cls={pctCls(todayPct)} />
            <Row label="风险分" value={fmt(stockContext?.risk.data?.riskScoreTotal, 1)} />
            <Row label="仓位上限" value={stockContext?.risk.data?.capMultiplier != null ? `${stockContext.risk.data.capMultiplier.toFixed(2)}x` : '--'} />
            <Row label="行业" value={stockContext?.main?.industry ?? '--'} />
            <Row label="交易限制" value={stockContext?.risk.data?.tradeAllowed == null ? '--' : stockContext.risk.data.tradeAllowed ? '允许交易' : '受限制'} />
            <Row label="生命周期" value={stockContext?.lifecycle.data?.lifecycleLabel ?? '--'} />
            <Row label="观察天数" value={stockContext?.lifecycle.data?.poolDay != null ? `${stockContext.lifecycle.data.poolDay}` : '--'} />
          </>
        )}
      </div>
    </>
  )
}

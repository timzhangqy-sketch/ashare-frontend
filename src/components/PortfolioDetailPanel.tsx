import { useState } from 'react'
import type { StockContextViewModel } from '../types/contextPanel'
import { CandlestickChart, Minus, Plus, XCircle } from 'lucide-react'

const ACTION_SIGNAL_MAP: Record<string, string> = {
  TRAILING_STOP: '追踪止损',
  BREAKOUT: '突破信号',
  PULLBACK: '回调信号',
  STOP_LOSS: '止损出场',
  TAKE_PROFIT: '止盈出场',
  HOLD: '持续持有',
  EXIT: '主动退出',
}

const STRATEGY_LABEL_MAP: Record<string, string> = {
  VOL_SURGE: '连续放量蓄势',
  RETOC2: '第4次异动',
  PATTERN_T2UP9: 'T-2大涨蓄势',
  WEAK_BUY: '弱市吸筹',
  PATTERN_GREEN10: '形态策略',
  GREEN10: '形态策略',
}

import type { DataSourceMeta } from '../types/dataSource'
import type {
  PortfolioActionShellVm,
  PortfolioContextLinkVm,
  PortfolioContextVm,
  PortfolioOpenRowVm,
  PortfolioClosedRowVm,
} from '../modules/portfolio/types'
import { formatSignalReason } from '../utils/formatters'

type SectionKey = 'basic' | 'position' | 'judgment' | 'context' | 'action'

const DEFAULT_SECTIONS: Record<SectionKey, boolean> = {
  basic: true,
  position: true,
  judgment: true,
  context: true,
  action: true,
}

function SectionTitle({
  title,
  expanded,
  onToggle,
}: {
  title: string
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className="portfolio-context-section-title"
      onClick={onToggle}
      style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', background: 'none', border: 'none', color: 'inherit', font: 'inherit', padding: 0 }}
    >
      <span style={{ flex: 1 }}>{title}</span>
      <span className="numeric-muted" style={{ fontSize: 10 }}>{expanded ? '▼' : '▶'}</span>
    </button>
  )
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value == null) return '--'
  return value.toFixed(digits)
}

function formatPercent(value: number | null | undefined) {
  if (value == null) return '--'
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

function getFactLabel(label: string): string {
  switch (label) {
    case 'open_date':
      return '建仓日期'
    case 'open_price':
      return '建仓价格'
    case 'shares':
      return '持仓数量'
    case 'hold_days':
      return '持有天数'
    case 'unrealized_pnl':
      return '浮动盈亏'
    case 'unrealized_pnl_pct':
      return '浮动收益率'
    case 'realized_pnl':
      return '已实现盈亏'
    case 'realized_pnl_pct':
      return '已实现收益率'
    case 'action_signal':
      return '当前信号'
    case 'signal_reason':
      return '原因说明'
    case 'exit_reason':
      return '退出说明'
    case 'execution_hint':
      return '动作建议'
    case 'source_hint':
      return '承接关系'
    default:
      return label
  }
}

function getLinkNote(link: PortfolioContextLinkVm): string {
  return link.note ?? ''
}

function getActionIntro(activeRow: PortfolioOpenRowVm | PortfolioClosedRowVm | null): string {
  if (!activeRow) return '选择持仓后，可在这里继续查看来源、流水和后续动作。'
  if (activeRow.status === 'closed') return '围绕这条已平仓记录继续回看来源、成交和退出依据。'
  return '围绕当前持仓继续查看来源、成交和后续动作。'
}

interface PortfolioDetailPanelProps {
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
  onLink,
  onActionShell: _onActionShell,
  onOpenKline,
}: PortfolioDetailPanelProps) {
  const [sections, setSections] = useState<Record<SectionKey, boolean>>(DEFAULT_SECTIONS)

  const toggle = (key: SectionKey) => {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <>
      <div className="portfolio-context-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div className="portfolio-context-title">{activeContext.title}</div>
          <div className="portfolio-context-code numeric-muted">{activeContext.code}</div>
        </div>
        <div className="portfolio-context-status">{activeContext.statusLabel}</div>
      </div>

      {onOpenKline ? (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <button type="button" className="action-icon-btn" title="K线" onClick={onOpenKline}>
            <CandlestickChart size={14} />
          </button>
          <button type="button" className="action-icon-btn" title="加仓" disabled>
            <Plus size={14} />
          </button>
          <button type="button" className="action-icon-btn" title="减仓" disabled>
            <Minus size={14} />
          </button>
          <button type="button" className="action-icon-btn" title="平仓" disabled>
            <XCircle size={14} />
          </button>
        </div>
      ) : null}

      <div className="portfolio-context-section">
        <SectionTitle title="基本信息" expanded={sections.basic} onToggle={() => toggle('basic')} />
        {sections.basic && (
        <div className="portfolio-context-grid">
          <div>
            <div className="portfolio-context-label">来源策略</div>
            <div className="portfolio-context-value">{activeContext.sourceStrategyLabel}</div>
          </div>
          <div>
            <div className="portfolio-context-label">承接关系</div>
            <div className="portfolio-context-value">{activeContext.sourceHint}</div>
          </div>
          <div>
            <div className="portfolio-context-label">当前入口</div>
            <div className="portfolio-context-value">{activeContext.sourceQueryValue}</div>
          </div>
        </div>
        )}
      </div>

      <div className="portfolio-context-section">
        <SectionTitle title="持仓事实" expanded={sections.position} onToggle={() => toggle('position')} />
        {sections.position && (
        <div className="portfolio-context-grid">
          {activeContext.holdingFacts.map((item) => (
            <div key={item.label}>
              <div className="portfolio-context-label">{getFactLabel(item.label)}</div>
              <div className="portfolio-context-value">{item.value}</div>
            </div>
          ))}
        </div>
        )}
      </div>

      <div className="portfolio-context-section">
        <SectionTitle title="判断依据" expanded={sections.judgment} onToggle={() => toggle('judgment')} />
        {sections.judgment && (
        <div className="portfolio-context-list">
          {activeContext.judgementFacts.map((item) => (
            <div key={item.label} className="portfolio-context-list-row">
              <span className="portfolio-context-label">{getFactLabel(item.label)}</span>
              <span className="portfolio-context-list-value">
                {item.label === 'action_signal'
                  ? (ACTION_SIGNAL_MAP[item.value ?? ''] ?? item.value)
                  : (item.label === 'signal_reason' || item.label === 'exit_reason')
                    ? formatSignalReason(item.value)
                    : item.value}
              </span>
            </div>
          ))}
        </div>
        )}
      </div>

      <div className="portfolio-context-section">
        <SectionTitle title="股票上下文" expanded={sections.context} onToggle={() => toggle('context')} />
        {sections.context && (
        <>
        {stockContextLoading ? (
          <div className="portfolio-context-empty">正在加载股票上下文...</div>
        ) : (
          <>
            <div className="portfolio-context-grid">
              <div>
                <div className="portfolio-context-label">最新价</div>
                <div className="portfolio-context-value numeric">{formatNumber(activeRow?.latestClose ?? stockContext?.main?.close)}</div>
              </div>
              <div>
                <div className="portfolio-context-label">今日涨跌幅</div>
                <div
                  className="portfolio-context-value numeric"
                  style={{
                    color:
                      (activeRow && 'todayPnlPct' in activeRow ? activeRow.todayPnlPct : stockContext?.main?.pctChg) != null
                        ? (activeRow && 'todayPnlPct' in activeRow ? activeRow.todayPnlPct! : stockContext?.main?.pctChg!) > 0
                          ? 'var(--up)'
                          : (activeRow && 'todayPnlPct' in activeRow ? activeRow.todayPnlPct! : stockContext?.main?.pctChg!) < 0
                            ? 'var(--down)'
                            : undefined
                        : undefined,
                  }}
                >
                  {formatPercent(activeRow && 'todayPnlPct' in activeRow ? activeRow.todayPnlPct : stockContext?.main?.pctChg)}
                </div>
              </div>
              <div>
                <div className="portfolio-context-label">风险分</div>
                <div className="portfolio-context-value numeric">{formatNumber(stockContext?.risk.data?.riskScoreTotal, 1)}</div>
              </div>
              <div>
                <div className="portfolio-context-label">仓位上限</div>
                <div className="portfolio-context-value numeric">
                  {stockContext?.risk.data?.capMultiplier != null ? `${Number(stockContext.risk.data.capMultiplier).toFixed(2)}x` : '--'}
                </div>
              </div>
              <div>
                <div className="portfolio-context-label">所属行业</div>
                <div className="portfolio-context-value">{stockContext?.main?.industry ?? '--'}</div>
              </div>
            </div>

            <div className="portfolio-context-list" style={{ marginTop: 12 }}>
              <div className="portfolio-context-list-row">
                <span className="portfolio-context-label">交易限制</span>
                <span className="portfolio-context-list-value">
                  {stockContext?.risk.data?.tradeAllowed == null
                    ? '--'
                    : stockContext.risk.data.tradeAllowed
                      ? '当前可交易'
                      : '当前受限制'}
                </span>
              </div>
              <div className="portfolio-context-list-row">
                <span className="portfolio-context-label">限制原因</span>
                <span className="portfolio-context-list-value">{stockContext?.risk.data?.blockReason ?? '--'}</span>
              </div>
              <div className="portfolio-context-list-row">
                <span className="portfolio-context-label">生命周期</span>
                <span className="portfolio-context-list-value">{stockContext?.lifecycle.data?.lifecycleLabel ?? '--'}</span>
              </div>
              <div className="portfolio-context-list-row">
                <span className="portfolio-context-label">交易标的池天数</span>
                <span className="portfolio-context-list-value numeric">
                  {stockContext?.lifecycle.data?.poolDay == null ? '--' : `${stockContext.lifecycle.data.poolDay}`}
                </span>
              </div>
            </div>
          </>
        )}
        </>
        )}
      </div>

      <div className="portfolio-context-section">
        <div className="portfolio-context-section-title">详情补充</div>
        <div className="portfolio-context-list">
          <div className="portfolio-context-list-row">
            <span className="portfolio-context-label">峰值回撤</span>
            <span className="portfolio-context-list-value">
              {activeRow?.drawdownFromPeak != null
                ? `-${(activeRow.drawdownFromPeak * 100).toFixed(2)}%`
                : '--'}
            </span>
          </div>
          <div className="portfolio-context-list-row">
            <span className="portfolio-context-label">来源策略</span>
            <span className="portfolio-context-list-value">
              {STRATEGY_LABEL_MAP[activeRow?.sourceStrategy ?? ''] ?? activeRow?.sourceStrategy ?? '--'}
            </span>
          </div>
          <div className="portfolio-context-list-row">
            <span className="portfolio-context-label">仓位上限因子</span>
            <span className="portfolio-context-list-value">
              {activeRow?.positionCapMultiplierFinal != null
                ? `${activeRow.positionCapMultiplierFinal.toFixed(2)}x`
                : '--'}
            </span>
          </div>
        </div>
      </div>

      <div className="portfolio-context-section">
        <SectionTitle title="动作承接" expanded={sections.action} onToggle={() => toggle('action')} />
        {sections.action && (
        <>
        <div className="portfolio-context-empty">{getActionIntro(activeRow)}</div>
        <div className="portfolio-inline-meta" style={{ marginBottom: 10 }}>{activeContext.transactionSummary}</div>
        <div className="portfolio-context-label" style={{ marginBottom: 8 }}>相关入口</div>
        <div className="portfolio-context-link-list">
          {activeContext.relatedLinks.map((link) => (
            <button
              key={link.key}
              type="button"
              className={`portfolio-context-link${link.enabled ? '' : ' is-disabled'}`}
              onClick={() => onLink(link)}
            >
              <span>{link.label}</span>
              <span className="portfolio-inline-meta">{getLinkNote(link)}</span>
            </button>
          ))}
        </div>
        </>
        )}
      </div>
    </>
  )
}

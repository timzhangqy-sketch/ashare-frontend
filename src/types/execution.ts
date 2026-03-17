export type ExecutionTab = 'orders' | 'positions' | 'fills' | 'constraints'

export type ExecutionSource =
  | 'direct'
  | 'dashboard'
  | 'signals'
  | 'watchlist'
  | 'portfolio'
  | 'risk'

export type ExecutionDataStatus = 'real' | 'fallback' | 'unavailable'

import type { DataSourceMeta } from './dataSource'

export type SimOrderStatus =
  | 'draft'
  | 'queued'
  | 'submitted'
  | 'partial'
  | 'filled'
  | 'rejected'
  | 'canceled'

export type SimFillStatus = 'none' | 'partial' | 'filled'

export type ExecutionConstraintStatus = 'allow' | 'warn' | 'block'

export type ExecutionRiskLevel = 'low' | 'medium' | 'high'

export type ExecutionTone = 'neutral' | 'success' | 'warning' | 'danger'

export type ExecutionObjectType = 'order' | 'position' | 'fill' | 'constraint'

export interface ExecutionQueryModel {
  tab: ExecutionTab
  source: ExecutionSource
  focus: string | null
  strategy: string | null
}

export interface ExecutionMetric {
  key: string
  label: string
  value: string
  note: string
  dataSource?: DataSourceMeta
}

export interface ExecutionFilterChip {
  key: string
  label: string
  value: string
}

export interface ExecutionTabMeta {
  key: ExecutionTab
  label: string
  description: string
  count: number
}

export interface ExecutionTabState {
  status: ExecutionDataStatus
  note: string
  dataSource?: DataSourceMeta
}

export interface ExecutionRelationSummary {
  orderId: string | null
  positionId: string | null
  fillIds: string[]
}

export interface ExecutionBaseRow {
  id: string
  objectType: ExecutionObjectType
  tsCode: string
  name: string
  tradeDate: string
  observingDay?: number | null
  observingDayLabel?: string | null
  sourceDomain: ExecutionSource
  sourceLabel: string
  sourceStrategy: string | null
  strategyLabel: string
  focusKey: string
  statusLabel: string
  statusTone: ExecutionTone
  summary: string
  riskLevel: ExecutionRiskLevel
  riskLevelLabel: string
  tradeAllowed: boolean
  tradeAllowedLabel: string
  constraintStatus: ExecutionConstraintStatus
  constraintStatusLabel: string
  blockReason: string | null
  blockSource: string | null
  positionCapMultiplier: number | null
  positionCapText: string
  related: ExecutionRelationSummary
}

export interface SimOrderRow extends ExecutionBaseRow {
  objectType: 'order'
  side: 'buy' | 'sell'
  qty: number
  price: number
  orderStatus: SimOrderStatus
  orderStatusLabel: string
  submitTime: string
  fillStatus: SimFillStatus
  fillStatusLabel: string
  orderType: 'limit' | 'market'
}

export interface SimPositionRow extends ExecutionBaseRow {
  objectType: 'position'
  entryTime: string
  entryPrice: number
  shares: number
  marketValue: number
  unrealizedPnl: number
  unrealizedPnlPct: number
  fromOrderStatus: SimOrderStatus | null
  positionStatusLabel: string
}

export interface SimFillRow extends ExecutionBaseRow {
  objectType: 'fill'
  side: 'buy' | 'sell'
  fillTime: string
  fillPrice: number
  fillQty: number
  fillStatus: SimFillStatus
  fillStatusLabel: string
  orderStatus: SimOrderStatus
  orderStatusLabel: string
}

export interface ExecutionConstraintRow extends ExecutionBaseRow {
  objectType: 'constraint'
  recommendedPositionText: string
  actionHint: string
  constraintScope: 'watchlist' | 'portfolio' | 'cross-domain'
}

export type ExecutionRow =
  | SimOrderRow
  | SimPositionRow
  | SimFillRow
  | ExecutionConstraintRow

export interface ExecutionContextSection {
  title: string
  items: Array<{ label: string; value: string }>
}

export interface ExecutionNextStep {
  label: string
  kind: 'route' | 'insight' | 'placeholder'
  note: string
}

export interface ExecutionContextModel {
  title: string
  subtitle: string
  sourceSummary: string
  observingDayLabel?: string | null
  sections: ExecutionContextSection[]
  nextSteps: ExecutionNextStep[]
  dataSource?: DataSourceMeta
}

export interface ExecutionWorkspaceViewModel {
  title: string
  subtitle: string
  observingSummary?: string | null
  query: ExecutionQueryModel
  metrics: ExecutionMetric[]
  filterChips: ExecutionFilterChip[]
  tabs: ExecutionTabMeta[]
  dataStatus: ExecutionDataStatus
  statusNote: string
  tabStates: Record<ExecutionTab, ExecutionTabState>
  dataSources: Record<ExecutionTab, DataSourceMeta>
  focusMissNote: string | null
  orders: SimOrderRow[]
  positions: SimPositionRow[]
  fills: SimFillRow[]
  constraints: ExecutionConstraintRow[]
  selectedId: string | null
  context: ExecutionContextModel | null
  noFocus: {
    title: string
    description: string
  }
  dataSource?: DataSourceMeta
}

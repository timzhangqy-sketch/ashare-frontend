import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, CandlestickChart, FileText, Microscope, Play } from 'lucide-react';
import type { ReactNode } from 'react';
import StockDrawer from '../components/Drawer/StockDrawer';
import SourceBadge from '../components/data-source/SourceBadge';
import { loadSignalsWorkspace } from '../adapters/signals';
import { useContextPanel } from '../context/useContextPanel';
import { useDate } from '../context/useDate';
import { useApiData } from '../hooks/useApiData';
import type { StockContextPanelPayload } from '../types/contextPanel';
import type { DataSourceMeta } from '../types/dataSource';
import type { StockDetail } from '../types/stock';
import {
  signalsTabOrder,
  type SignalsBuyRowVm,
  type SignalsFlowRowVm,
  type SignalsResonanceRowVm,
  type SignalsSellRowVm,
  type SignalsTabKey,
  type SignalsTruthFieldKey,
  type SignalsWorkspaceVm,
} from '../types/signals';
import { buildDataSourceMeta } from '../utils/dataSource';
import { getStrategyDisplayName } from '../utils/displayNames';
import {
  displayActionSignal,
  displaySignalLabel,
  displaySourceLabel,
  displayStrategyLabel,
} from '../utils/labelMaps';
import { formatSignalReason } from '../utils/formatters';
import SignalDistributionPanel from '../components/SignalDistributionPanel';
import { buildResearchHref } from '../utils/researchHandoff';
import { getMockDetail } from '../utils/score';

const SIGNALS_TAB_TIPS: Record<string, string> = {
  buy: '来源：交易标的池(active) + 4策略当日触发合并去重\n展示所有在池候选和当日新触发的标的\n信号列：触发了买点信号(BREAKOUT/VOL_CONFIRM/PULLBACK/REHEAT)的标的会显示具体信号类型，未触发的显示"观察中"',
  sell: '来源：持仓中心(open) 中触发了卖出信号的标的\n7类卖点按优先级：硬止损(浮亏≥10%) > 跟踪止损(回撤≥15%) > 环境恶化(bearish/weak+盈<3%) > 板块退潮(板块3日跌>1.5%) > 量能萎缩(VR3<0.4) > 趋势破位(3日<MA20) > 时间衰减(≥30天±5%)',
  resonance: '来源：同一只股票被2个及以上策略同时选中\n共振标的通常具有更高的胜率和期望收益\n策略组合：VOL_SURGE/RETOC2/T2UP9/WEAK_BUY',
  flow: '来源：买点+卖点+共振信号按时间合并\n以时间线方式展示当日所有信号触发事件的完整流程',
};

type SignalsRowVm =
  | SignalsBuyRowVm
  | SignalsSellRowVm
  | SignalsResonanceRowVm
  | SignalsFlowRowVm;

type TabSelectionMap = Partial<Record<SignalsTabKey, string>>;
type ActionKind = 'execute' | 'jump' | 'placeholder';

interface SignalsActionVm {
  label: string;
  kind: ActionKind;
  onClick?: () => void;
  disabled?: boolean;
  testId?: string;
}

interface SignalsSelectionVm {
  title: string;
  tsCode: string;
  signal: string;
  source: string;
  inWatchlist: boolean;
  inPortfolio: boolean;
  summary: string;
  tags: string[];
  dataSource: DataSourceMeta;
  actions: SignalsActionVm[];
}

interface SignalsDrawerState {
  stock: StockDetail;
  sourceMeta: DataSourceMeta;
}

function normalizeTab(value: string | null): SignalsTabKey {
  return signalsTabOrder.includes(value as SignalsTabKey) ? (value as SignalsTabKey) : 'buy';
}

function originClassName(origin: string): string {
  return `signals-origin-${origin}`;
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  return value == null ? '--' : value.toFixed(digits);
}

function formatSigned(value: number | null | undefined, suffix = '', digits = 2): string {
  return value == null ? '--' : `${value > 0 ? '+' : ''}${value.toFixed(digits)}${suffix}`;
}

function pnlClass(value: number | null | undefined): string {
  if (value == null || value === 0) return 'c-muted';
  return value > 0 ? 'c-up' : 'c-down';
}

function displayStrategyName(value: string | null | undefined): string {
  if (!value) return '--';
  const mapped = displayStrategyLabel(value);
  if (mapped && mapped !== value) return mapped;
  return getStrategyDisplayName(value) ?? value;
}

function getActiveRows(workspace: SignalsWorkspaceVm, activeTab: SignalsTabKey): SignalsRowVm[] {
  if (activeTab === 'buy') return workspace.tabs.buy.rows;
  if (activeTab === 'sell') return workspace.tabs.sell.rows;
  if (activeTab === 'resonance') return workspace.tabs.resonance.rows;
  return workspace.tabs.flow.rows;
}

function findRowByTsCode(rows: SignalsRowVm[], tsCode: string | null): SignalsRowVm | null {
  return tsCode ? rows.find((row) => row.tsCode === tsCode) ?? null : null;
}

function buildExecutionHref(tsCode: string, strategy: string | null): string {
  const params = new URLSearchParams({ tab: 'orders', source: 'signals', focus: tsCode });
  if (strategy) params.set('strategy', strategy);
  return `/execution?${params.toString()}`;
}

function getStrategyMeta(strategySource: string): { path: string; strategy: string } | null {
  const value = strategySource.toUpperCase();
  if (value.includes('VOL') || strategySource.includes('量能')) {
    return { path: '/dashboard', strategy: 'VOL_SURGE' };
  }
  if (value.includes('RETOC2') || strategySource.includes('异动')) {
    return { path: '/retoc2', strategy: 'RETOC2' };
  }
  if (value.includes('PATTERN') || strategySource.includes('形态')) {
    return { path: '/pattern', strategy: 'PATTERN' };
  }
  return null;
}

function buildStrategyHref(strategySource: string, tsCode: string): string | null {
  const meta = getStrategyMeta(strategySource);
  if (!meta) return null;
  const params = new URLSearchParams({
    ts_code: tsCode,
    source: 'signals',
    strategy: meta.strategy,
  });
  return `${meta.path}?${params.toString()}`;
}

function getRowStrategies(row: SignalsRowVm): string[] {
  if ('strategies' in row) return row.strategies;
  if ('strategySource' in row) return [row.strategySource];
  if ('sourceStrategy' in row) return [row.sourceStrategy];
  return [(row as SignalsFlowRowVm).strategySource];
}

type SignalsFieldMeta = NonNullable<SignalsRowVm['truthMeta'][SignalsTruthFieldKey]>;

function getRowFieldMeta(row: SignalsRowVm, fields: SignalsTruthFieldKey[]): SignalsFieldMeta[] {
  const result: SignalsFieldMeta[] = [];
  for (const field of fields) {
    const meta = row.truthMeta[field];
    if (meta) result.push(meta);
  }
  return result;
}

function buildSignalsSourceMeta(
  sourceLabel: string,
  defaultDetail: string,
  metas: SignalsFieldMeta[],
  options?: {
    hasFallback?: boolean;
    fallbackDetail?: string;
    forcePlaceholder?: boolean;
  },
): DataSourceMeta {
  const labels = Array.from(new Set(metas.map((meta) => meta.label)));
  const details = Array.from(new Set(metas.map((meta) => meta.detail)));
  const detailParts = [defaultDetail];
  if (labels.length) detailParts.push(`字段归属: ${labels.join(' / ')}`);
  if (details.length) detailParts.push(details.join('；'));

  if (options?.forcePlaceholder) {
    return buildDataSourceMeta({
      data_source: 'placeholder',
      source_label: sourceLabel,
      source_detail: detailParts.join('。'),
    });
  }

  const hasReal = metas.some((meta) => meta.kind === 'real');
  const hasCompatible = metas.some((meta) => meta.kind === 'compatible');
  const hasDerived = metas.some((meta) => meta.kind === 'derived');
  const hasPlaceholder = metas.some((meta) => meta.kind === 'placeholder');
  const hasFallback = options?.hasFallback ?? false;

  let dataSource: DataSourceMeta['data_source'] = 'real';
  if (hasPlaceholder && !hasReal && !hasCompatible && !hasDerived && !hasFallback) dataSource = 'placeholder';
  else if (hasFallback && !hasReal && !hasCompatible && !hasDerived && !hasPlaceholder) dataSource = 'fallback';
  else if (hasCompatible && !hasReal && !hasDerived && !hasPlaceholder && !hasFallback) dataSource = 'fallback';
  else if (hasCompatible || hasDerived || hasPlaceholder || hasFallback) dataSource = 'mixed';

  return buildDataSourceMeta({
    data_source: dataSource,
    source_label: sourceLabel,
    source_detail: detailParts.join('。'),
    degrade_reason: hasFallback ? (options?.fallbackDetail ?? null) : null,
  });
}

function getSelectionFieldKeys(activeTab: SignalsTabKey): SignalsTruthFieldKey[] {
  if (activeTab === 'buy') return ['pctChg', 'signalStrength'];
  if (activeTab === 'sell') return ['signalReason'];
  if (activeTab === 'resonance') return ['pctChg', 'strategyCount'];
  return ['timeLabel', 'followAction'];
}

function buildSelectionSourceMeta(row: SignalsRowVm, activeTab: SignalsTabKey): DataSourceMeta {
  const metas = getRowFieldMeta(row, getSelectionFieldKeys(activeTab));
  const hasFallback = activeTab === 'sell' && 'isFallbackReason' in row ? row.isFallbackReason : false;
  return buildSignalsSourceMeta(
    'Signals 右侧上下文',
    '当前卡片承接 Signals 选中行，混合展示真实字段、兼容结果与前端派生摘要。',
    metas,
    {
      hasFallback,
      fallbackDetail: hasFallback ? 'signalReason 当前为空值兜底文案，不应视为接口真值。' : undefined,
    },
  );
}

function buildDrawerSourceMeta(row: SignalsRowVm): DataSourceMeta {
  return buildSignalsSourceMeta(
    'Signals 抽屉',
    '抽屉顶部承接当前行标识；drawer detail 仍由 Signals 行摘要生成，不是完整真值链。',
    getRowFieldMeta(row, ['drawerDetail']),
    { forcePlaceholder: true },
  );
}

// Signals drawer still seeds placeholder detail from the selected row.
function buildDrawerPlaceholderStock(row: SignalsRowVm): StockDetail {
  const close = 'latestClose' in row ? row.latestClose ?? 0 : 'close' in row ? row.close ?? 0 : 0;
  const changePct = 'pctChg' in row ? row.pctChg ?? 0 : 'todayPnl' in row ? row.todayPnl ?? 0 : 0;
  return getMockDetail(row.tsCode, row.name, getRowStrategies(row), close, changePct);
}

function buildSelectionVm(
  row: SignalsRowVm | null,
  activeTab: SignalsTabKey,
  tradeDate: string,
  jumpTo: (href: string | null, fallbackText: string) => void,
  openDetail: (target: SignalsRowVm, autoOpenBuyForm?: boolean) => void,
  onPlaceholder: (text: string) => void,
): SignalsSelectionVm | null {
  if (!row) return null;

  if (activeTab === 'buy') {
    const currentRow = row as SignalsBuyRowVm;
    const strategyHref = buildStrategyHref(currentRow.strategySource, currentRow.tsCode);
    return {
      title: currentRow.name,
      tsCode: currentRow.tsCode,
      signal: currentRow.signalType,
      source: displayStrategyName(currentRow.strategySource),
      inWatchlist: currentRow.inWatchlist,
      inPortfolio: currentRow.inPortfolio,
      summary: `${currentRow.signalStrength} / 共振 ${currentRow.crossStrategyCount}`,
      tags: [currentRow.sourceLabel],
      dataSource: buildSelectionSourceMeta(currentRow, activeTab),
      actions: [
        { label: '查看详情', kind: 'execute', onClick: () => openDetail(currentRow) },
        { label: '承接', kind: 'execute', onClick: () => openDetail(currentRow, true) },
        {
          label: '研究中心',
          kind: 'jump',
          onClick: () => jumpTo(
            buildResearchHref({
              source: 'signals',
              focus: currentRow.tsCode,
              strategy: currentRow.strategySource,
              tradeDate,
              detailRoute: 'backtest',
              detailKey: currentRow.strategySource,
            }),
            '',
          ),
        },
        {
          label: '执行中心',
          kind: 'jump',
          onClick: () => jumpTo(buildExecutionHref(currentRow.tsCode, currentRow.strategySource), ''),
        },
        {
          label: '策略页',
          kind: strategyHref ? 'jump' : 'placeholder',
          onClick: strategyHref
            ? () => jumpTo(strategyHref, '')
            : () => onPlaceholder('当前对象没有可返回的策略页。'),
        },
      ],
    };
  }

  if (activeTab === 'sell') {
    const currentRow = row as SignalsSellRowVm;
    return {
      title: currentRow.name,
      tsCode: currentRow.tsCode,
      signal: currentRow.actionSignal,
      source: displayStrategyName(currentRow.sourceStrategy),
      inWatchlist: false,
      inPortfolio: true,
      summary: `持有 ${currentRow.holdDays ?? '--'} 天 / 浮盈亏 ${formatSigned(currentRow.unrealizedPnl)}`,
      tags: [currentRow.sourceLabel],
      dataSource: buildSelectionSourceMeta(currentRow, activeTab),
      actions: [
        { label: '查看详情', kind: 'execute', onClick: () => openDetail(currentRow) },
        {
          label: '研究中心',
          kind: 'jump',
          onClick: () => jumpTo(
            buildResearchHref({
              source: 'signals',
              focus: currentRow.tsCode,
              strategy: currentRow.sourceStrategy,
              tradeDate,
              detailRoute: 'backtest',
              detailKey: currentRow.sourceStrategy,
            }),
            '',
          ),
        },
        {
          label: '执行中心',
          kind: 'jump',
          onClick: () => jumpTo(buildExecutionHref(currentRow.tsCode, currentRow.sourceStrategy), ''),
        },
        {
          label: '持仓中心',
          kind: 'jump',
          onClick: () => jumpTo(`/portfolio?source=signals&focus=${encodeURIComponent(currentRow.tsCode)}`, ''),
        },
      ],
    };
  }

  if (activeTab === 'resonance') {
    const currentRow = row as SignalsResonanceRowVm;
    return {
      title: currentRow.name,
      tsCode: currentRow.tsCode,
      signal: currentRow.latestSignal,
      source: currentRow.strategies.map((strategy) => displayStrategyName(strategy)).join(' / '),
      inWatchlist: currentRow.inWatchlist,
      inPortfolio: currentRow.inPortfolio,
      summary: `${currentRow.strategyCount} 个策略共振`,
      tags: [currentRow.sourceLabel],
      dataSource: buildSelectionSourceMeta(currentRow, activeTab),
      actions: [
        { label: '查看详情', kind: 'execute', onClick: () => openDetail(currentRow) },
        {
          label: '研究中心',
          kind: 'jump',
          onClick: () => jumpTo(
            buildResearchHref({
              source: 'signals',
              focus: currentRow.tsCode,
              strategy: currentRow.strategies[0] ?? null,
              resonance: String(currentRow.strategyCount),
              tradeDate,
              detailRoute: 'resonance',
              detailKey: currentRow.strategies.join('+'),
            }),
            '',
          ),
        },
        {
          label: '执行中心',
          kind: 'jump',
          onClick: () => jumpTo(buildExecutionHref(currentRow.tsCode, currentRow.strategies[0] ?? null), ''),
        },
        { label: '承接', kind: 'execute', onClick: () => openDetail(currentRow, true) },
      ],
    };
  }

  const currentRow = row as SignalsFlowRowVm;
  return {
    title: currentRow.name,
    tsCode: currentRow.tsCode,
    signal: currentRow.eventType,
    source: displayStrategyName(currentRow.strategySource),
    inWatchlist: false,
    inPortfolio: false,
    summary: `${currentRow.timeLabel} / ${currentRow.followAction}`,
    tags: [currentRow.sourceLabel, currentRow.signalLabel],
    dataSource: buildSelectionSourceMeta(currentRow, activeTab),
    actions: [
      { label: '查看详情', kind: 'execute', onClick: () => openDetail(currentRow) },
      {
        label: '研究中心',
        kind: 'jump',
        onClick: () => jumpTo(
          buildResearchHref({
            source: 'signals',
            focus: currentRow.tsCode,
            strategy: currentRow.strategySource,
            tradeDate,
            detailRoute: 'backtest',
            detailKey: currentRow.strategySource,
          }),
          '',
        ),
      },
      {
        label: '执行中心',
        kind: 'jump',
        onClick: () => jumpTo(buildExecutionHref(currentRow.tsCode, currentRow.strategySource), ''),
      },
      {
        label: '事件占位',
        kind: 'placeholder',
        onClick: () => onPlaceholder('当前事件流详情仍为占位承接。'),
      },
    ],
  };
}

function buildSignalsContextPayload(
  row: SignalsRowVm,
  tradeDate: string,
  selectionVm: SignalsSelectionVm | null,
  openDetail: (target: SignalsRowVm, autoOpenBuyForm?: boolean) => void,
  jumpTo: (href: string | null, fallbackText: string) => void,
): StockContextPanelPayload {
  const primaryStrategy = getRowStrategies(row)[0] ?? null;

  return {
    title: row.name,
    name: row.name,
    tsCode: row.tsCode,
    sourceStrategy: primaryStrategy,
    subtitle: selectionVm?.signal ?? '信号摘要',
    summary: selectionVm?.summary ?? '查看当前对象的信号、来源策略和承接动作。',
    tags: (selectionVm?.tags ?? []).map((tag) => ({ label: tag, tone: 'state' as const })),
    summaryItems: [
      { label: '来源策略', value: selectionVm?.source ?? '--' },
      { label: '当前信号', value: selectionVm?.signal ?? '--' },
      { label: '交易日', value: tradeDate },
    ],
    actions: [
      { label: '查看详情', onClick: () => openDetail(row), note: '打开当前对象详情。' },
      {
        label: '进入研究中心',
        href: buildResearchHref({
          source: 'signals',
          focus: row.tsCode,
          strategy: primaryStrategy,
          tradeDate,
          detailRoute: primaryStrategy ? 'backtest' : null,
          detailKey: primaryStrategy,
        }),
        note: '查看研究承接。',
      },
      {
        label: '进入执行中心',
        href: buildExecutionHref(row.tsCode, primaryStrategy),
        note: '查看执行承接。',
      },
      {
        label: '进入策略页',
        onClick: () => jumpTo(buildStrategyHref(primaryStrategy ?? '', row.tsCode), '当前对象没有可返回的策略页。'),
        note: '回到来源策略页。',
      },
    ],
  };
}

type ActionVariant = 'primary' | 'secondary';

function getActionIcon(action: SignalsActionVm): { icon: ReactNode; title: string } {
  const label = action.label ?? '';
  if (label.includes('查看') || label.includes('详情')) {
    return { icon: <CandlestickChart size={14} />, title: 'K线详情' };
  }
  if (label.includes('承接')) {
    return { icon: <ArrowRight size={14} />, title: '承接' };
  }
  if (label.includes('研究')) {
    return { icon: <Microscope size={14} />, title: '研究' };
  }
  if (label.includes('执行')) {
    return { icon: <Play size={14} />, title: '执行' };
  }
  if (label.includes('策略')) {
    return { icon: <FileText size={14} />, title: '策略页' };
  }
  return { icon: <CandlestickChart size={14} />, title: label || '操作' };
}

function ActionButton({ action }: { action: SignalsActionVm; variant: ActionVariant }) {
  const { icon, title } = getActionIcon(action);
  return (
    <button
      type="button"
      className="action-icon-btn"
      data-testid={action.testId}
      onClick={action.onClick}
      disabled={action.disabled}
      title={title}
    >
      {icon}
    </button>
  );
}

function RowActionGroup({ actions, detailOpenTestId }: { actions: SignalsActionVm[]; detailOpenTestId?: string }) {
  const detail = actions.find((a) => a.label.includes('查看') || a.label.includes('详情'));
  const handoff = actions.find((a) => a.label.includes('承接'));
  const research = actions.find((a) => a.label.includes('研究'));

  const primaryActions: { action: SignalsActionVm; variant: ActionVariant }[] = [];
  if (detail) primaryActions.push({ action: detail, variant: 'secondary' });
  if (handoff) primaryActions.push({ action: handoff, variant: 'primary' });
  if (research) primaryActions.push({ action: research, variant: 'secondary' });

  return (
    <div className="signals-row-actions">
      <div className="signals-row-actions-line">
        {primaryActions.map(({ action, variant }, index) => (
          <ActionButton
            key={`${action.label}-${action.kind}-${variant}`}
            action={index === 0 && detailOpenTestId ? { ...action, testId: detailOpenTestId } : action}
            variant={variant}
          />
        ))}
      </div>
    </div>
  );
}

function getTableColumns(activeTab: SignalsTabKey, opts?: { hasPrice?: boolean; hasTurnover?: boolean }): string[] {
  if (activeTab === 'buy') {
    const cols = ['标的', '主概念', '策略', '信号'];
    if (opts?.hasPrice !== false) cols.push('价格', '涨跌');
    if (opts?.hasTurnover !== false) cols.push('换手', '共振');
    cols.push('状态', '来源', '动作');
    return cols;
  }
  if (activeTab === 'sell') return ['标的', '主概念', '策略', '动作信号', '持仓天数', '最新价', '日内涨跌', '浮盈亏', '原因', '来源', '动作'];
  if (activeTab === 'resonance') return ['标的', '主概念', '策略组合', '策略数', '最新信号', '价格', '涨跌', '状态', '来源', '动作'];
  return ['时间', '事件', '策略', '标的', '代码', '信号', '跟进动作', '来源', '动作'];
}

function renderTableRows(
  activeTab: SignalsTabKey,
  rows: SignalsRowVm[],
  selectedCode: string | null,
  tradeDate: string | null,
  onSelect: (row: SignalsRowVm) => void,
  openDetail: (row: SignalsRowVm, autoOpenBuyForm?: boolean) => void,
  jumpTo: (href: string | null, fallbackText: string) => void,
  onPlaceholder: (text: string) => void,
  columnOpts?: { hasPrice?: boolean; hasTurnover?: boolean },
) {
  const hasPriceData = columnOpts?.hasPrice !== false;
  const hasTurnoverData = columnOpts?.hasTurnover !== false;
  return rows.map((row) => {
    const actions = buildSelectionVm(row, activeTab, tradeDate ?? '', jumpTo, openDetail, onPlaceholder)?.actions ?? [];
    const detailOpenTestId =
      activeTab === 'resonance' || activeTab === 'flow' ? `signals-detail-open-${activeTab}-${row.tsCode}` : undefined;

    return (
      <tr
        key={`${activeTab}-${row.id}`}
        className={selectedCode === row.tsCode ? 'signals-table-row selected' : 'signals-table-row'}
        data-testid={`signals-row-${activeTab}-${row.tsCode}`}
        onClick={() => onSelect(row)}
      >
        {activeTab === 'buy' ? (
          <>
            <td>
              <div className="signals-cell-title">{row.name}</div>
              <div className="signals-inline-meta numeric-muted">{row.tsCode}</div>
            </td>
            <td style={{ textAlign: 'left' }}>
              {(row as SignalsBuyRowVm).primaryConcept ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '2px 8px', fontSize: '12px', color: '#c2c6d6' }}>
                    {(row as SignalsBuyRowVm).primaryConcept}
                  </span>
                  {(row as SignalsBuyRowVm).isLeader && <span title={(row as SignalsBuyRowVm).leaderReason || '概念龙头'} style={{ fontSize: '12px', cursor: 'help' }}>👑</span>}
                </span>
              ) : <span style={{ color: '#8c909f' }}>—</span>}
            </td>
            <td>{displayStrategyName((row as SignalsBuyRowVm).strategySource)}</td>
            <td>
              <div>{displaySignalLabel((row as SignalsBuyRowVm).signalType)}</div>
            </td>
            {hasPriceData ? (
              <>
                <td className="right numeric">{formatNumber((row as SignalsBuyRowVm).close)}</td>
                <td className={`right numeric signals-pnl-value ${pnlClass((row as SignalsBuyRowVm).pctChg)}`}>{formatSigned((row as SignalsBuyRowVm).pctChg, '%')}</td>
              </>
            ) : null}
            {hasTurnoverData ? (
              <>
                <td className="right numeric">
                  {(row as SignalsBuyRowVm).turnoverRate != null
                    ? `${formatNumber((row as SignalsBuyRowVm).turnoverRate)}%`
                    : '--'}
                </td>
                <td className="center numeric">{(row as SignalsBuyRowVm).crossStrategyCount}</td>
              </>
            ) : null}
            <td>
              <div className="signals-status-stack">
                <span className={`signals-mini-pill${(row as SignalsBuyRowVm).inWatchlist ? ' active' : ''}`}>交易标的池</span>
                {(row as SignalsBuyRowVm).inPortfolio
                  ? <span className="signals-mini-pill active" style={{ color: '#ff5451' }}>持仓</span>
                  : <span className="signals-mini-pill">观察</span>}
              </div>
            </td>
            <td>
              <div className={`signals-origin-badge ${originClassName((row as SignalsBuyRowVm).origin)}`}>
                {displaySourceLabel((row as SignalsBuyRowVm).sourceLabel)}
              </div>
            </td>
          </>
        ) : null}

        {activeTab === 'sell' ? (
          <>
            <td>
              <div className="signals-cell-title">{row.name}</div>
              <div className="signals-inline-meta numeric-muted">{row.tsCode}</div>
            </td>
            <td style={{ textAlign: 'left' }}>
              {(row as SignalsSellRowVm).primaryConcept ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '2px 8px', fontSize: '12px', color: '#c2c6d6' }}>
                    {(row as SignalsSellRowVm).primaryConcept}
                  </span>
                  {(row as SignalsSellRowVm).isLeader && <span title={(row as SignalsSellRowVm).leaderReason || '概念龙头'} style={{ fontSize: '12px', cursor: 'help' }}>👑</span>}
                </span>
              ) : <span style={{ color: '#8c909f' }}>—</span>}
            </td>
            <td>{displayStrategyName((row as SignalsSellRowVm).sourceStrategy)}</td>
            <td>{displayActionSignal((row as SignalsSellRowVm).actionSignal)}</td>
            <td className="right numeric">{(row as SignalsSellRowVm).holdDays != null ? `${(row as SignalsSellRowVm).holdDays} 天` : '--'}</td>
            <td className="right numeric">{formatNumber((row as SignalsSellRowVm).latestClose)}</td>
            <td className={`right numeric signals-pnl-value ${pnlClass((row as SignalsSellRowVm).todayPnl)}`}>{formatSigned((row as SignalsSellRowVm).todayPnl, '%')}</td>
            <td className={`right numeric signals-pnl-value ${pnlClass((row as SignalsSellRowVm).unrealizedPnl)}`}>{formatSigned((row as SignalsSellRowVm).unrealizedPnl, '%')}</td>
            <td className="signals-cell-wrap">{formatSignalReason((row as SignalsSellRowVm).signalReason)}</td>
            <td>
              <div className={`signals-origin-badge ${originClassName((row as SignalsSellRowVm).origin)}`}>
                {displaySourceLabel((row as SignalsSellRowVm).sourceLabel)}
              </div>
            </td>
          </>
        ) : null}

        {activeTab === 'resonance' ? (
          <>
            <td>
              <div className="signals-cell-title">{row.name}</div>
              <div className="signals-inline-meta numeric-muted">{row.tsCode}</div>
            </td>
            <td style={{ textAlign: 'left' }}>
              {(row as SignalsResonanceRowVm).primaryConcept ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '2px 8px', fontSize: '12px', color: '#c2c6d6' }}>
                    {(row as SignalsResonanceRowVm).primaryConcept}
                  </span>
                  {(row as SignalsResonanceRowVm).isLeader && <span title={(row as SignalsResonanceRowVm).leaderReason || '概念龙头'} style={{ fontSize: '12px', cursor: 'help' }}>👑</span>}
                </span>
              ) : <span style={{ color: '#8c909f' }}>—</span>}
            </td>
            <td className="signals-cell-wrap">
              {(row as SignalsResonanceRowVm).strategies.map((strategy) => displayStrategyName(strategy)).join(' / ')}
            </td>
            <td className="center numeric">{(row as SignalsResonanceRowVm).strategyCount}</td>
            <td>{displaySignalLabel((row as SignalsResonanceRowVm).latestSignal)}</td>
            <td className="right numeric">{formatNumber((row as SignalsResonanceRowVm).close)}</td>
            <td className={`right numeric signals-pnl-value ${pnlClass((row as SignalsResonanceRowVm).pctChg)}`}>{formatSigned((row as SignalsResonanceRowVm).pctChg, '%')}</td>
            <td>
              <div className="signals-status-stack">
                <span className={`signals-mini-pill${(row as SignalsResonanceRowVm).inWatchlist ? ' active' : ''}`}>交易标的池</span>
                {(row as SignalsResonanceRowVm).inPortfolio
                  ? <span className="signals-mini-pill active" style={{ color: '#ff5451' }}>持仓</span>
                  : <span className="signals-mini-pill">观察</span>}
              </div>
            </td>
            <td>
              <div className={`signals-origin-badge ${originClassName((row as SignalsResonanceRowVm).origin)}`}>
                {displaySourceLabel((row as SignalsResonanceRowVm).sourceLabel)}
              </div>
            </td>
          </>
        ) : null}

        {activeTab === 'flow' ? (
          <>
            <td className="numeric">{(row as SignalsFlowRowVm).timeLabel}</td>
            <td>{(row as SignalsFlowRowVm).eventType}</td>
            <td>{displayStrategyName((row as SignalsFlowRowVm).strategySource)}</td>
            <td>{row.name}</td>
            <td className="numeric-muted">{row.tsCode}</td>
            <td>{displaySignalLabel((row as SignalsFlowRowVm).signalLabel)}</td>
            <td>{(row as SignalsFlowRowVm).followAction}</td>
            <td>
              <div className={`signals-origin-badge ${originClassName((row as SignalsFlowRowVm).origin)}`}>
                {displaySourceLabel((row as SignalsFlowRowVm).sourceLabel)}
              </div>
            </td>
          </>
        ) : null}

        <td onClick={(event) => event.stopPropagation()}>
          <RowActionGroup actions={actions} detailOpenTestId={detailOpenTestId} />
        </td>
      </tr>
    );
  });
}

export default function Signals() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { selectedDate } = useDate();
  const { data, loading, error, refetch } = useApiData(() => loadSignalsWorkspace(selectedDate), [selectedDate]);
  const activeTab = normalizeTab(searchParams.get('tab'));
  const focusCode = searchParams.get('focus');
  const [selectedCodes, setSelectedCodes] = useState<TabSelectionMap>({});
  const [drawerState, setDrawerState] = useState<SignalsDrawerState | null>(null);
  const [autoOpenBuyForm, setAutoOpenBuyForm] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ tone: 'info' | 'success' | 'warning'; text: string } | null>(null);
  const { openPanel, closePanel } = useContextPanel();
  const unmountedRef = useRef(false);

  const buyListRef = useRef<HTMLDivElement>(null);
  const sellListRef = useRef<HTMLDivElement>(null);
  const resonanceListRef = useRef<HTMLDivElement>(null);
  const triggerListRef = useRef<HTMLDivElement>(null);
  const scrollPosRef = useRef(0);
  const signalsListRefs = [buyListRef, sellListRef, resonanceListRef, triggerListRef];

  useEffect(() => {
    return () => { unmountedRef.current = true; };
  }, []);

  const workspace = data;
  const activeVm = workspace?.tabs[activeTab];
  const activeRows = workspace ? getActiveRows(workspace, activeTab) : [];
  const focusedRow = findRowByTsCode(activeRows, focusCode);
  const rememberedCode = selectedCodes[activeTab] ?? null;
  const rememberedRow = findRowByTsCode(activeRows, rememberedCode);
  const selectedRow = focusedRow ?? rememberedRow ?? activeRows[0] ?? null;
  const selectedCode = selectedRow?.tsCode ?? null;
  const focusMissNote = focusCode && activeRows.length > 0 && !focusedRow
    ? `未找到焦点对象 ${focusCode}，已回退到当前 Tab 的首个对象。`
    : null;

  useEffect(() => {
    const activeRef = signalsListRefs[signalsTabOrder.indexOf(activeTab)];
    if (activeRef?.current && scrollPosRef.current > 0) {
      activeRef.current.scrollTop = scrollPosRef.current;
    }
  }, [data, selectedCode]);

  const syncSearchParams = (updater: (params: URLSearchParams) => void) => {
    if (unmountedRef.current) return;
    if (!pathname.startsWith('/signals')) return;
    const nextParams = new URLSearchParams(searchParams);
    updater(nextParams);
    setSearchParams(nextParams, { replace: true });
  };

  const clearFeedback = () => {
    setActionFeedback(null);
  };

  const selectRow = (tab: SignalsTabKey, row: SignalsRowVm) => {
    const listRef = signalsListRefs[signalsTabOrder.indexOf(tab)];
    if (listRef?.current) scrollPosRef.current = listRef.current.scrollTop;
    clearFeedback();
    setSelectedCodes((prev) => ({ ...prev, [tab]: row.tsCode }));
    syncSearchParams((params) => {
      if (tab === 'buy') params.delete('tab');
      else params.set('tab', tab);
      params.set('focus', row.tsCode);
    });
  };

  const openDetail = (row: SignalsRowVm, openBuyForm = false) => {
    if (unmountedRef.current || !pathname.startsWith('/signals')) return;
    selectRow(activeTab, row);
    setAutoOpenBuyForm(openBuyForm);
    setDrawerState({
      stock: buildDrawerPlaceholderStock(row),
      sourceMeta: buildDrawerSourceMeta(row),
    });
    setActionFeedback({
      tone: openBuyForm ? 'success' : 'info',
      text: openBuyForm ? `已打开 ${row.name} 的承接入口。` : `已打开 ${row.name} 的详情。`,
    });
  };

  const jumpTo = (href: string | null, fallbackText: string) => {
    if (!href) {
      setActionFeedback({ tone: 'warning', text: fallbackText });
      return;
    }
    navigate(href);
  };

  const markPlaceholder = (text: string) => {
    setActionFeedback({ tone: 'warning', text });
  };

  const selectionVm = buildSelectionVm(
    selectedRow,
    activeTab,
    workspace?.tradeDate ?? selectedDate,
    jumpTo,
    openDetail,
    markPlaceholder,
  );

  useEffect(() => {
    if (unmountedRef.current) return;
    if (!pathname.startsWith('/signals')) {
      closePanel();
      return;
    }
    if (!selectedRow || !selectionVm) {
      closePanel();
      return;
    }

    const panelOpenDetail = (row: SignalsRowVm, openBuyForm = false) => {
      if (unmountedRef.current) return;
      setSelectedCodes((prev) => ({ ...prev, [activeTab]: row.tsCode }));
      const nextParams = new URLSearchParams(searchParams);
      if (activeTab === 'buy') nextParams.delete('tab');
      else nextParams.set('tab', activeTab);
      nextParams.set('focus', row.tsCode);
      setSearchParams(nextParams, { replace: true });
      setAutoOpenBuyForm(openBuyForm);
      setDrawerState({
        stock: buildDrawerPlaceholderStock(row),
        sourceMeta: buildDrawerSourceMeta(row),
      });
      setActionFeedback({
        tone: openBuyForm ? 'success' : 'info',
        text: openBuyForm ? `已打开 ${row.name} 的承接入口。` : `已打开 ${row.name} 的详情。`,
      });
    };

    const panelJumpTo = (href: string | null, fallbackText: string) => {
      if (unmountedRef.current) return;
      if (!href) {
        setActionFeedback({ tone: 'warning', text: fallbackText });
        return;
      }
      navigate(href);
    };

    openPanel({
      entityType: 'stock',
      entityKey: selectedRow.tsCode,
      sourcePage: 'signals',
      tradeDate: selectedDate,
      focus: selectedRow.tsCode,
      activeTab,
      payloadVersion: 'v1',
      payload: buildSignalsContextPayload(
        selectedRow,
        workspace?.tradeDate ?? selectedDate,
        selectionVm,
        panelOpenDetail,
        panelJumpTo,
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeTab,
    closePanel,
    openPanel,
    selectedDate,
    selectedRow?.tsCode,
    workspace?.tradeDate,
  ]);

  useEffect(() => {
    return () => {
      unmountedRef.current = true;
      closePanel();
    };
  }, [closePanel]);


  const handleTabChange = (nextTab: SignalsTabKey) => {
    clearFeedback();
    syncSearchParams((params) => {
      if (nextTab === 'buy') params.delete('tab');
      else params.set('tab', nextTab);
      const remembered = selectedCodes[nextTab];
      if (remembered) params.set('focus', remembered);
      else params.delete('focus');
    });
  };

  const hasPriceData = activeTab === 'buy' && activeRows.some((r) => (r as SignalsBuyRowVm).close != null && (r as SignalsBuyRowVm).close !== 0);
  const hasTurnoverData = activeTab === 'buy' && activeRows.some((r) => (r as SignalsBuyRowVm).turnoverRate != null && (r as SignalsBuyRowVm).turnoverRate !== 0);
  const tableColumnOpts = { hasPrice: hasPriceData, hasTurnover: hasTurnoverData };

  return (
    <div className="signals-page" data-testid="signals-page">
      {actionFeedback ? (
        <section className={`signals-feedback-banner ${actionFeedback.tone}`}>
          {actionFeedback.text}
        </section>
      ) : null}
      {!actionFeedback && focusMissNote ? (
        <section className="signals-feedback-banner warning">
          {focusMissNote}
        </section>
      ) : null}

      <SignalDistributionPanel />

      <div className="page-tabs signals-tabs signals-tabs-with-count">
        <div className="signals-tabs-buttons">
          {signalsTabOrder.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`page-tab-btn${activeTab === tab ? ' active' : ''}`}
              onClick={() => handleTabChange(tab)}
            >
              {workspace?.tabs[tab].label ?? tab}
              {SIGNALS_TAB_TIPS[tab] && (
                <span className="sig-tab-tip" onClick={e => e.stopPropagation()}>
                  <span className="sig-tab-tip-icon">ⓘ</span>
                  <span className="sig-tab-tip-tooltip">{SIGNALS_TAB_TIPS[tab]}</span>
                </span>
              )}
            </button>
          ))}
        </div>
        {!loading && !error && activeVm ? (
          <div className="signals-tabs-count">共 {activeRows.length} 条</div>
        ) : null}
      </div>

      <div className="signals-layout">
        <div className="signals-main">

          {loading ? (
            <section className="card">
              <div className="signals-loading-state">
                <div className="spinner" />
                <span>正在加载 Signals 数据...</span>
              </div>
            </section>
          ) : null}

          {!loading && error ? (
            <section className="card">
              <div className="page-error">
                <div className="page-error-msg">Signals 数据加载失败</div>
                <div className="page-error-detail">{error}</div>
                <button className="retry-btn" onClick={refetch}>重试</button>
              </div>
            </section>
          ) : null}

          <section className="card">
            <div className="card-header">
              <div className="source-card-head">
                <span className="card-title">{activeVm?.label ?? activeTab}</span>
              </div>
              <SourceBadge meta={activeVm?.tableDataSource ?? activeVm?.dataSource} showWhenReal />
            </div>

            {!loading && !error ? (
              <div
                ref={signalsListRefs[signalsTabOrder.indexOf(activeTab)]}
                className="signals-list-container"
              >
                <table className="data-table">
                  <thead>
                    <tr>
                      {getTableColumns(activeTab, tableColumnOpts).map((column) => {
                        const isRight = ['价格', '涨跌', '换手', '最新价', '日内涨跌', '浮盈亏'].includes(column);
                        const isCenter = ['共振', '策略数', '持仓天数'].includes(column);
                        return (
                          <th key={column} style={isRight ? { textAlign: 'right' } : isCenter ? { textAlign: 'center' } : undefined}>{column}</th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {activeRows.length === 0 ? (
                      <tr className="signals-table-empty-row">
                        <td colSpan={getTableColumns(activeTab, tableColumnOpts).length}>
                          <div className="signals-empty-state">
                            <div className="signals-empty-title">{activeVm?.emptyTitle ?? '暂无数据'}</div>
                            <div className="signals-empty-text">{activeVm?.emptyText ?? '当前没有可显示的信号。'}</div>
                          </div>
                        </td>
                      </tr>
                    ) : renderTableRows(
                      activeTab,
                      activeRows,
                      selectedCode,
                      workspace?.tradeDate ?? selectedDate,
                      (row) => selectRow(activeTab, row),
                      openDetail,
                      jumpTo,
                      markPlaceholder,
                      tableColumnOpts,
                    )}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </div>

      </div>

      <StockDrawer
        stock={drawerState?.stock ?? null}
        sourceMeta={drawerState?.sourceMeta ?? null}
        autoOpenBuyForm={autoOpenBuyForm}
        onClose={() => {
          setDrawerState(null);
          setAutoOpenBuyForm(false);
          closePanel();
        }}
      />
    </div>
  );
}



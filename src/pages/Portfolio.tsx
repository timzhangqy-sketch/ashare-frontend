import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PortfolioDetailPanel from '../components/PortfolioDetailPanel';
import StockDrawer from '../components/Drawer/StockDrawer';
import SourceBadge from '../components/data-source/SourceBadge';
import { useContextPanel } from '../context/useContextPanel';
import { useDate } from '../context/useDate';
import { useApiData } from '../hooks/useApiData';
import { useStockContextViewModel } from '../hooks/useStockContextViewModel';
import { fetchPortfolioConcentration } from '../api';
import { buildPortfolioContext, loadPortfolioWorkspace } from '../modules/portfolio/adapter';
import { getStrategyDisplayName } from '../utils/displayNames';
import { FileText } from 'lucide-react';
import type {
  PortfolioActionShellVm,
  PortfolioClosedRowVm,
  PortfolioContextLinkVm,
  PortfolioOpenRowVm,
  PortfolioTabKey,
  PortfolioTransactionRowVm,
} from '../modules/portfolio/types';
import type { StockContextPanelPayload } from '../types/contextPanel';
import type { DataSourceMeta } from '../types/dataSource';
import type { StockDetail } from '../types/stock';
import { formatSignalReason } from '../utils/formatters';
import { getMockDetail } from '../utils/score';
import { buildResearchHref } from '../utils/researchHandoff';

type FeedbackTone = 'info' | 'success' | 'warning';

interface FeedbackState {
  tone: FeedbackTone;
  message: string;
}

type PortfolioMetaPreset = 'page' | 'summary' | 'table' | 'context' | 'detail';

const EMPTY_OPEN_ROWS: PortfolioOpenRowVm[] = [];
const EMPTY_CLOSED_ROWS: PortfolioClosedRowVm[] = [];
const EMPTY_TRANSACTION_ROWS: PortfolioTransactionRowVm[] = [];

const SIGNAL_TYPE_MAP: Record<string, string> = {
  BREAKOUT: '突破买入',
  PULLBACK: '回调买入',
  TRAILING_STOP: '追踪止损',
  STOP_LOSS: '止损出场',
  HARD_STOP: '强制止损',
  TAKE_PROFIT: '止盈出场',
  HOLD: '持续持有',
  EXIT: '主动退出',
  BUY: '买入',
  SELL: '卖出',
};

function normalizeTab(value: string | null): PortfolioTabKey {
  return value === 'closed' || value === 'transactions' ? value : 'open';
}

function normalizeSection(value: string | null): 'open' | 'closed' | null {
  return value === 'open' || value === 'closed' ? value : null;
}

function formatMoney(value: number | null | undefined): string {
  return value == null ? '--' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

function formatPercent(value: number | null | undefined): string {
  return value == null ? '--' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;
}

/** 后端已为百分比值（如 -3.57 表示 -3.57%），直接 toFixed(2) + '%' */
function formatPercentAlready(value: number | null | undefined): string {
  return value == null ? '--' : `${value >= 0 ? '+' : ''}${Number(value).toFixed(2)}%`;
}

function formatHoldDays(row: { holdDays?: number | null; openDate?: string }, forOpen: boolean): string {
  if (row.holdDays != null && !Number.isNaN(row.holdDays)) return `${row.holdDays}天`;
  if (!forOpen) return '--';
  const d = row.openDate;
  if (!d || typeof d !== 'string') return '--';
  const t = new Date(d).getTime();
  if (Number.isNaN(t)) return '--';
  const days = Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
  return `${days}天`;
}

function buildSourceLink(row: PortfolioOpenRowVm | PortfolioClosedRowVm): string | null {
  if (!row.sourceStrategy) return null;
  if (row.sourceStrategy.includes('VOL') || row.sourceStrategy.includes('IGNITE')) {
    return `/dashboard?source=portfolio&focus=${encodeURIComponent(row.tsCode)}&strategy=${encodeURIComponent(row.sourceStrategy)}`;
  }
  if (row.sourceStrategy.includes('RETOC2')) {
    return `/retoc2?source=portfolio&focus=${encodeURIComponent(row.tsCode)}&strategy=${encodeURIComponent(row.sourceStrategy)}`;
  }
  if (row.sourceStrategy.includes('PATTERN')) {
    return `/pattern?source=portfolio&focus=${encodeURIComponent(row.tsCode)}&strategy=${encodeURIComponent(row.sourceStrategy)}`;
  }
  return null;
}

function findOpenRow(rows: PortfolioOpenRowVm[], focus: string | null, portfolioId: string | null): PortfolioOpenRowVm | null {
  if (portfolioId) {
    const byId = rows.find((row) => String(row.id) === portfolioId);
    if (byId) return byId;
  }
  if (focus) {
    const byFocus = rows.find((row) => row.tsCode === focus || String(row.id) === focus);
    if (byFocus) return byFocus;
  }
  return rows[0] ?? null;
}

function findClosedRow(rows: PortfolioClosedRowVm[], focus: string | null, portfolioId: string | null): PortfolioClosedRowVm | null {
  if (portfolioId) {
    const byId = rows.find((row) => String(row.id) === portfolioId);
    if (byId) return byId;
  }
  if (focus) {
    const byFocus = rows.find((row) => row.tsCode === focus || String(row.id) === focus);
    if (byFocus) return byFocus;
  }
  return rows[0] ?? null;
}

function buildPortfolioMeta(meta: DataSourceMeta | null | undefined, preset: PortfolioMetaPreset): DataSourceMeta | undefined {
  if (!meta) return undefined;

  const copy: Record<PortfolioMetaPreset, { detail: string; degraded: string; empty: string }> = {
    page: {
      detail: '本页汇总当前持仓、已平仓和成交流水的已承接结果。',
      degraded: '当前页仍有区块使用兼容结果，已按真实来源状态单独标出。',
      empty: '真实接口已接通，但当前组合暂无可展示记录。',
    },
    summary: {
      detail: '概览卡汇总当前页签已承接的数据结果。',
      degraded: '概览卡中包含前端聚合或兼容结果。',
      empty: '真实接口已接通，但当前页签暂无概览数据。',
    },
    table: {
      detail: '主表展示当前页签已加载的记录。',
      degraded: '主表当前包含兼容字段或派生字段。',
      empty: '真实接口已接通，但当前页签暂无表格记录。',
    },
    context: {
      detail: '右侧卡片展示当前选中标的的已承接信息。',
      degraded: '右侧卡片当前仍混合真实字段与兼容结果。',
      empty: '真实接口已接通，但当前选中标的暂无可展示信息。',
    },
    detail: {
      detail: '详情补充优先承接真实股票上下文与持仓关联信息。',
      degraded: '详情补充当前包含兼容结果或局部降级结果。',
      empty: '真实接口已接通，但当前标的暂无这类详情记录。',
    },
  };

  const resolved = copy[preset];
  return {
    ...meta,
    source_detail: resolved.detail,
    degrade_reason: meta.degraded || meta.data_source === 'degraded' ? resolved.degraded : null,
    empty_reason: meta.is_empty ? resolved.empty : meta.empty_reason,
  };
}

function getTableTitle(activeTab: PortfolioTabKey): string {
  if (activeTab === 'open') return '当前持仓';
  if (activeTab === 'closed') return '已平仓记录';
  return '成交流水';
}

function getTransactionIntro(relatedTsCode: string | null, rowCount: number): string {
  if (relatedTsCode) return `当前聚焦 ${relatedTsCode} 的已加载成交记录，共 ${rowCount} 条。`;
  return `当前展示已加载的成交记录，共 ${rowCount} 条。`;
}

function getTransactionSummaryText(row: PortfolioOpenRowVm | PortfolioClosedRowVm | null): string {
  if (!row) return '选择持仓后，可在这里查看关联成交记录和动作承接。';
  if (row.relatedTransactions.length > 0) {
    return `已关联 ${row.relatedTransactions.length} 条成交记录。`;
  }
  return '当前持仓尚未关联到已加载的成交记录。';
}

function buildPortfolioContextPanelPayload(
  row: PortfolioOpenRowVm | PortfolioClosedRowVm,
  tradeDate: string,
): StockContextPanelPayload {
  const sourceHref = buildSourceLink(row);
  const watchlistHref = row.fromWatchlist
    ? `/watchlist?source=portfolio&focus=${encodeURIComponent(row.tsCode)}&strategy=${encodeURIComponent(row.sourceStrategy)}`
    : null;
  const transactionHref = `/portfolio?tab=transactions&source=portfolio&focus=${encodeURIComponent(row.tsCode)}&portfolioId=${encodeURIComponent(String(row.id))}&relatedTsCode=${encodeURIComponent(row.tsCode)}&section=${row.status}`;

  return {
    title: row.name,
    name: row.name,
    tsCode: row.tsCode,
    sourceStrategy: row.sourceStrategy,
    subtitle: row.statusLabel,
    summary: getTransactionSummaryText(row),
    tags: [
      { label: row.statusLabel, tone: 'state' as const },
      { label: row.sourceStrategyLabel, tone: 'strategy' as const },
      { label: row.fromWatchlist ? '来自 Watchlist' : '直接入组合', tone: 'source' as const },
    ],
    summaryItems: [
      { label: '持仓状态', value: row.statusLabel },
      { label: '来源策略', value: row.sourceStrategyLabel },
      { label: '建仓日期', value: row.openDate },
      { label: '持有天数', value: formatHoldDays(row, row.status === 'open') },
      {
        label: row.status === 'closed' ? '已实现盈亏' : '浮动盈亏',
        value: row.status === 'closed' ? formatMoney((row as PortfolioClosedRowVm).realizedPnl) : formatMoney(row.unrealizedPnl),
      },
    ],
    actions: [
      {
        label: '查看研究详情',
        href: buildResearchHref({
          source: 'portfolio',
          focus: row.tsCode,
          strategy: row.sourceStrategy,
          tradeDate,
          detailRoute: row.sourceStrategy ? 'backtest' : null,
          detailKey: row.sourceStrategy,
        }),
        note: '前往研究详情页',
      },
      {
        label: '查看风险分析',
        href: `/risk?tab=breakdown&source=portfolio&focus=${encodeURIComponent(row.tsCode)}&scope=portfolio`,
        note: '前往风险分析页',
      },
      {
        label: '前往执行页',
        href: `/execution?tab=positions&source=portfolio&focus=${encodeURIComponent(row.tsCode)}${row.sourceStrategy ? `&strategy=${encodeURIComponent(row.sourceStrategy)}` : ''}`,
        note: '前往执行页承接动作',
      },
      {
        label: '回来源策略页',
        href: sourceHref ?? undefined,
        disabled: !sourceHref,
        note: sourceHref ? '回到来源策略页面' : '当前无法回到来源策略页面',
      },
      {
        label: '查看交易标的池',
        href: watchlistHref ?? undefined,
        disabled: !watchlistHref,
        note: watchlistHref ? '查看关联交易标的池记录' : '当前没有关联交易标的池记录',
      },
      {
        label: '查看成交流水',
        href: transactionHref,
        note: '查看关联成交记录',
      },
    ],
  };
}

function buildPortfolioDisplayMeta(
  meta: DataSourceMeta | undefined,
  preset: PortfolioMetaPreset,
): DataSourceMeta | undefined {
  if (!meta) return undefined;

  const copy: Record<PortfolioMetaPreset, { detail: string; degraded: string; empty: string }> = {
    page: {
      detail: '本页汇总当前持仓、已平仓和成交流水。',
      degraded: '局部区块当前使用兼容结果。',
      empty: '当前暂无可展示记录。',
    },
    summary: {
      detail: '当前页签概览。',
      degraded: '局部指标为聚合结果。',
      empty: '当前页签暂无概览数据。',
    },
    table: {
      detail: '当前页签主表。',
      degraded: '部分列当前使用兼容结果。',
      empty: '当前页签暂无记录。',
    },
    context: {
      detail: '当前持仓摘要。',
      degraded: '局部说明当前使用兼容结果。',
      empty: '当前未选中持仓。',
    },
    detail: {
      detail: '股票上下文补充。',
      degraded: '已展示当前返回的上下文结果。',
      empty: '当前标的暂无补充记录。',
    },
  };

  const resolved = copy[preset];
  return {
    ...meta,
    source_detail: resolved.detail,
    degrade_reason: meta.degraded || meta.data_source === 'degraded' ? resolved.degraded : null,
    empty_reason: meta.is_empty ? resolved.empty : meta.empty_reason,
  };
}

function getSummaryDisplayLabel(label: string): string {
  if (label === '当前持仓数') return '当前持仓';
  if (label === '浮盈' || label === '+浮盈' || label === '总浮盈') return '持仓浮盈';
  if (label === '持有待仓位' || label === '待仓位') return '可交易仓位';
  return label;
}

const STRATEGY_COLOR: Record<string, string> = {
  VOL_SURGE: '#5B8FF9',
  RETOC2: '#5AD8A6',
  PATTERN_T2UP9: '#F6BD16',
  WEAK_BUY: '#ef4444',
  PATTERN_GREEN10: '#E8684A',
};
const STRATEGY_COLOR_OTHER = '#9B8EF8';
const INDUSTRY_COLORS = ['#5B8FF9', '#7BA3F9', '#9BB8F9', '#BBD0F9', '#D6E5FB'];
const INDUSTRY_OTHER_COLOR = '#CCCCCC';

function getStrategyBarColor(key: string | undefined): string {
  if (!key) return STRATEGY_COLOR_OTHER;
  const k = key.toUpperCase();
  return STRATEGY_COLOR[k] ?? STRATEGY_COLOR_OTHER;
}

function getIndustryBarColor(label: string | undefined, index: number): string {
  if (label === '其他' || (label && label.trim() === '其他')) return INDUSTRY_OTHER_COLOR;
  return INDUSTRY_COLORS[index % INDUSTRY_COLORS.length] ?? INDUSTRY_COLORS[0];
}

function getSummaryMetricHelper(activeTab: PortfolioTabKey, label: string): string {
  const displayLabel = getSummaryDisplayLabel(label);
  if (activeTab === 'open') {
    if (displayLabel === '当前持仓') return '统计当前持仓笔数';
    if (displayLabel === '总市值') return '按当前持仓市值汇总';
    if (displayLabel === '持仓浮盈' || displayLabel === '浮动盈亏') return '按当前持仓盈亏汇总';
    if (displayLabel === '告警持仓数') return '按当前持仓状态提示统计';
  }

  if (activeTab === 'closed') {
    if (label === '已平仓笔数') return '统计已平仓记录';
    if (label === '已实现盈亏') return '按已平仓结果汇总';
    if (label === '盈利笔数') return '统计盈利记录';
    if (label === '平均收益率') return '按已平仓记录计算';
  }

  if (activeTab === 'transactions') {
    if (label === '流水记录数') return 'data.total';
    if (label === '买入记录') return 'data.data 按 trade_type === BUY 统计';
    if (label === '卖出记录') return 'data.data 按 trade_type === SELL 统计';
    if (label === '主要触发来源') return '出现次数最多的 trigger_source，中文映射后显示';
  }

  return '展示当前区块已加载结果';
}

export default function Portfolio() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedDate } = useDate();
  const { openPanel, closePanel } = useContextPanel();
  const activeTab = normalizeTab(searchParams.get('tab'));
  const sourceQuery = searchParams.get('source');
  const focus = searchParams.get('focus');
  const portfolioId = searchParams.get('portfolioId');
  const relatedTsCode = searchParams.get('relatedTsCode');
  const section = normalizeSection(searchParams.get('section'));
  const { data, loading, error, refetch } = useApiData(() => loadPortfolioWorkspace(selectedDate), [selectedDate]);
  const [feedback, setFeedbackState] = useState<FeedbackState | null>(null);
  const [concentration, setConcentration] = useState<Record<string, unknown> | null>(null);
  const [drawerStock, setDrawerStock] = useState<StockDetail | null>(null);
  const [drawerAvgCost, setDrawerAvgCost] = useState<number | null>(null);
  const contextPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchPortfolioConcentration()
      .then(setConcentration)
      .catch(() => setConcentration(null));
  }, []);

  const openRows = useMemo(() => data?.openRows ?? EMPTY_OPEN_ROWS, [data?.openRows]);
  const closedRows = useMemo(() => data?.closedRows ?? EMPTY_CLOSED_ROWS, [data?.closedRows]);
  const activeOpenRow = findOpenRow(openRows, focus, portfolioId);
  const activeClosedRow = findClosedRow(closedRows, focus, portfolioId);

  const activeRow = useMemo(() => {
    if (activeTab === 'open') return activeOpenRow;
    if (activeTab === 'closed') return activeClosedRow;
    if (section === 'closed') return activeClosedRow;
    if (section === 'open') return activeOpenRow;
    return activeOpenRow ?? activeClosedRow;
  }, [activeClosedRow, activeOpenRow, activeTab, section]);

  useEffect(() => {
    if (contextPanelRef.current) {
      contextPanelRef.current.scrollTop = 0;
    }
  }, [activeRow?.tsCode]);

  const activeContext = useMemo(() => buildPortfolioContext(activeRow ?? null, sourceQuery), [activeRow, sourceQuery]);
  const { data: stockContext, loading: stockContextLoading } = useStockContextViewModel({
    tsCode: activeRow?.tsCode ?? null,
    tradeDate: selectedDate,
    sourcePage: 'portfolio',
    activeTab,
    focus: activeRow?.tsCode ?? null,
    payload: activeRow ? buildPortfolioContextPanelPayload(activeRow, selectedDate) : null,
    enabled: Boolean(activeRow),
  });
  const summary = data?.summary[activeTab];

  const summarySourceMeta = useMemo(() => buildPortfolioMeta(summary?.dataSource, 'summary'), [summary?.dataSource]);
  const tableSourceMeta = useMemo(
    () => buildPortfolioMeta(data?.tabs[activeTab].tableDataSource ?? data?.tabs[activeTab].dataSource, 'table'),
    [activeTab, data?.tabs],
  );
  const detailSourceMeta = useMemo(
    () => buildPortfolioMeta(stockContext?.dataSource ?? activeContext?.detailDataSource, 'detail'),
    [activeContext?.detailDataSource, stockContext?.dataSource],
  );
  const displaySummarySourceMeta = useMemo(() => buildPortfolioDisplayMeta(summarySourceMeta, 'summary'), [summarySourceMeta]);
  const displayTableSourceMeta = useMemo(() => buildPortfolioDisplayMeta(tableSourceMeta, 'table'), [tableSourceMeta]);
  const displayDetailSourceMeta = useMemo(() => buildPortfolioDisplayMeta(detailSourceMeta, 'detail'), [detailSourceMeta]);

  // 交易流水 Tab：表格与概览 KPI 共用同一数据源 data.transactions.rows（来自 GET /api/portfolio/transactions 的 data.data），不再使用 scopedRow.relatedTransactions
  const transactionRows = useMemo(() => {
    if (!data) return EMPTY_TRANSACTION_ROWS;
    let rows = data.transactions.rows;
    if (relatedTsCode) {
      const filtered = rows.filter((row) => row.tsCode === relatedTsCode);
      if (filtered.length > 0) rows = filtered;
    }
    return rows;
  }, [data, relatedTsCode]);

  const fallbackMessage = useMemo(() => {
    if (loading) return null;
    const portfolioIdMiss =
      portfolioId != null &&
      !openRows.some((row) => String(row.id) === portfolioId) &&
      !closedRows.some((row) => String(row.id) === portfolioId);
    const openFocusMiss = Boolean(focus && activeOpenRow && activeOpenRow.tsCode !== focus && String(activeOpenRow.id) !== focus);
    const closedFocusMiss = Boolean(focus && activeClosedRow && activeClosedRow.tsCode !== focus && String(activeClosedRow.id) !== focus);
    const useClosedSelection = activeTab === 'closed' || (activeTab === 'transactions' && section === 'closed');

    if (useClosedSelection && activeClosedRow && (portfolioIdMiss || closedFocusMiss)) {
      return '未命中指定已平仓记录，已自动回到最近可用记录。';
    }
    if (!useClosedSelection && activeOpenRow && (portfolioIdMiss || openFocusMiss)) {
      return '未命中指定当前持仓，已自动回到最近可用持仓。';
    }
    return null;
  }, [activeClosedRow, activeOpenRow, activeTab, closedRows, focus, loading, openRows, portfolioId, section]);

  const setParams = (mutator: (next: URLSearchParams) => void, replace = true) => {
    const next = new URLSearchParams(searchParams);
    mutator(next);
    setSearchParams(next, { replace });
  };

  const syncTab = (tab: PortfolioTabKey) => {
    setParams((next) => {
      if (tab === 'open') next.delete('tab');
      else next.set('tab', tab);
      if (tab !== 'transactions') next.delete('relatedTsCode');
    });
  };

  const selectOpenRow = (row: PortfolioOpenRowVm) => {
    setParams((next) => {
      next.set('focus', row.tsCode);
      next.set('portfolioId', String(row.id));
      next.set('section', 'open');
    });
  };

  const selectClosedRow = (row: PortfolioClosedRowVm) => {
    setParams((next) => {
      next.set('focus', row.tsCode);
      next.set('portfolioId', String(row.id));
      next.set('section', 'closed');
    });
  };

  const selectTransactionRow = (row: PortfolioTransactionRowVm) => {
    setParams((next) => {
      next.set('focus', row.tsCode);
      next.set('portfolioId', String(row.portfolioId));
      next.set('relatedTsCode', row.tsCode);
    });
  };

  const clearTransactionFocus = () => {
    setParams((next) => {
      next.delete('relatedTsCode');
      next.delete('portfolioId');
      next.delete('focus');
    });
  };

  const handleActionShell = (action: PortfolioActionShellVm) => {
    if (!activeRow) return;
    const subject = activeContext?.title ?? '当前持仓';

    if (activeRow.status === 'closed') {
      setFeedbackState({ tone: 'info', message: `${subject} 已平仓，当前只保留回顾信息，不再承接新的执行动作。` });
      return;
    }

    navigate(
      `/execution?tab=positions&source=portfolio&focus=${encodeURIComponent(activeRow.tsCode)}${activeRow.sourceStrategy ? `&strategy=${encodeURIComponent(activeRow.sourceStrategy)}` : ''}`,
    );
    setFeedbackState({
      tone: action.key === 'add' ? 'info' : 'warning',
      message: `${subject} 已转到执行页继续承接动作。`,
    });
  };

  const handleRelatedLink = (link: PortfolioContextLinkVm) => {
    if (!activeRow) return;

    if (link.key === 'source') {
      const href = buildSourceLink(activeRow);
      if (!href) {
        setFeedbackState({ tone: 'warning', message: `${activeRow.name} 当前没有可回溯的来源策略页。` });
        return;
      }
      navigate(href);
      return;
    }

    if (link.key === 'watchlist') {
      if (!activeRow.fromWatchlist) {
        setFeedbackState({ tone: 'info', message: `${activeRow.name} 当前没有关联的交易标的池记录。` });
        return;
      }
      navigate(`/watchlist?source=portfolio&focus=${encodeURIComponent(activeRow.tsCode)}&strategy=${encodeURIComponent(activeRow.sourceStrategy)}`);
      return;
    }

    setParams((next) => {
      next.set('tab', 'transactions');
      next.set('focus', activeRow.tsCode);
      next.set('portfolioId', String(activeRow.id));
      next.set('relatedTsCode', activeRow.tsCode);
      next.set('section', activeRow.status);
    });
  };

  useEffect(() => {
    if (!activeRow || !activeContext) {
      closePanel();
      return;
    }

    openPanel({
      entityType: 'stock',
      entityKey: activeRow.tsCode,
      sourcePage: 'portfolio',
      focus: activeRow.tsCode,
      activeTab: activeTab === 'transactions' ? `transactions:${section ?? activeRow.status}` : activeTab,
      payloadVersion: 'v1',
      payload: buildPortfolioContextPanelPayload(activeRow, selectedDate),
    });
  }, [activeContext, activeRow, activeTab, closePanel, openPanel, section, selectedDate]);

  useEffect(() => () => closePanel(), [closePanel]);

  return (
    <div className="portfolio-page" data-testid="portfolio-page">
      {feedback ? (
        <section className={`card portfolio-feedback portfolio-feedback-${feedback.tone}`}>
          <div className="portfolio-feedback-text">{feedback.message}</div>
          <button type="button" className="portfolio-feedback-close" onClick={() => setFeedbackState(null)}>
            关闭
          </button>
        </section>
      ) : null}

      {!feedback && fallbackMessage ? (
        <section className="card portfolio-feedback portfolio-feedback-warning">
          <div className="portfolio-feedback-text">{fallbackMessage}</div>
        </section>
      ) : null}

      <section className="card">
        <div className="card-header">
          <SourceBadge meta={displaySummarySourceMeta} />
        </div>
        <div className="card-body">
          <div
            className="portfolio-summary-strip portfolio-summary-grid-12"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
              gridAutoRows: 'auto',
              gap: '8px',
            }}
          >
            {(summary?.metrics ?? []).map((metric) => {
              const subText = metric.helper ?? getSummaryMetricHelper(activeTab, metric.label);
              const valueColor =
                metric.tone === 'up'
                  ? 'var(--up)'
                  : metric.tone === 'down'
                    ? 'var(--down)'
                    : metric.tone === 'warn'
                      ? 'var(--warn)'
                      : metric.tone === 'muted'
                        ? 'var(--text-muted)'
                        : 'var(--text-primary)';
              return (
                <div
                  key={metric.label}
                  className="stat-card portfolio-summary-card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    padding: '12px 14px',
                    minHeight: 72,
                    overflow: 'visible',
                    minWidth: 0,
                  }}
                >
                  <div
                    className="stat-label"
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      lineHeight: 1.3,
                      letterSpacing: '0.04em',
                    }}
                  >
                    {getSummaryDisplayLabel(metric.label)}
                  </div>
                  <div
                    className={`stat-value portfolio-summary-value numeric${
                      metric.tone ? ` portfolio-summary-tone-${metric.tone}` : ''
                    }`}
                    style={{
                      fontSize: '20px',
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                      lineHeight: 1.2,
                      color: valueColor,
                    }}
                  >
                    {metric.value}
                  </div>
                  {activeTab !== 'transactions' && activeTab !== 'closed' && subText ? (
                    <div className="stat-sub">{subText}</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {activeTab === 'open' && concentration ? (() => {
        const strategyDist = Array.isArray(concentration.strategy_distribution) ? concentration.strategy_distribution : [];
        const industryDist = Array.isArray(concentration.industry_distribution) ? concentration.industry_distribution : [];
        if (strategyDist.length > 0 || industryDist.length > 0) {
          console.log('[Portfolio concentration]', { strategy_distribution: strategyDist, industry_distribution: industryDist });
        }
        if (strategyDist.length === 0 && industryDist.length === 0) return null;
        return (
          <section className="concentration-section">
            <div className="concentration-col">
              <div className="concentration-title">策略分布</div>
              {strategyDist.length > 0 ? strategyDist.map((item: unknown, i: number) => {
                const row = item as Record<string, unknown>;
                const key = (row.strategy as string) ?? (row.key as string);
                const label = (row.label as string) ?? getStrategyDisplayName(key) ?? key ?? '—';
                const count = row.count != null ? Number(row.count) : 0;
                const pct = row.pct != null ? Number(row.pct) : 0;
                const widthPct = pct * 100;
                return (
                  <div key={`s-${i}-${key ?? ''}`} className="concentration-row">
                    <span className="concentration-label" title={label}>{label}</span>
                    <div className="concentration-bar-bg">
                      <div className="concentration-bar-fill" style={{ width: `${widthPct}%`, background: getStrategyBarColor(key) }} />
                    </div>
                    <span className="concentration-stat">{count}只 {widthPct.toFixed(1)}%</span>
                  </div>
                );
              }) : null}
            </div>
            <div className="concentration-col">
              <div className="concentration-title">行业分布</div>
              {industryDist.length > 0 ? industryDist.map((item: unknown, i: number) => {
                const row = item as Record<string, unknown>;
                const label = (row.industry as string) ?? (row.label as string) ?? (row.name as string) ?? '—';
                const count = row.count != null ? Number(row.count) : 0;
                const pct = row.pct != null ? Number(row.pct) : 0;
                const widthPct = pct * 100;
                return (
                  <div key={`i-${i}-${label}`} className="concentration-row">
                    <span className="concentration-label" title={label}>{label}</span>
                    <div className="concentration-bar-bg">
                      <div className="concentration-bar-fill" style={{ width: `${widthPct}%`, background: getIndustryBarColor(label, i) }} />
                    </div>
                    <span className="concentration-stat">{count}只 {widthPct.toFixed(1)}%</span>
                  </div>
                );
              }) : null}
            </div>
          </section>
        );
      })() : null}

      <div className="page-tabs portfolio-tabs">
        {(['open', 'closed', 'transactions'] as PortfolioTabKey[]).map((tab) => (
          <button key={tab} className={`page-tab-btn${activeTab === tab ? ' active' : ''}`} onClick={() => syncTab(tab)} type="button">
            {data?.tabs[tab].label ?? tab}
          </button>
        ))}
      </div>

      <div
        className="portfolio-layout"
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          height: 'calc(100vh - 112px)',
          overflow: 'hidden',
        }}
      >
        <div className="portfolio-main" style={{ flex: 1, overflowY: 'auto', minHeight: 0, height: '100%' }}>
          <section className="card">
            <div className="card-header">
              <div className="source-card-head">
                <span className="card-title">{getTableTitle(activeTab)}</span>
              </div>
              <div className="portfolio-card-header-right">
                {activeTab === 'transactions' && relatedTsCode ? (
                  <button
                    type="button"
                    className="portfolio-transactions-back"
                    onClick={clearTransactionFocus}
                  >
                    ← 返回全部流水
                  </button>
                ) : null}
                <SourceBadge meta={displayTableSourceMeta} showWhenReal />
              </div>
            </div>

            {loading ? (
              <div className="portfolio-loading-state">
                <div className="spinner" />
                <span>正在加载页面数据...</span>
              </div>
            ) : null}

            {!loading && !error && activeTab === 'open' ? (
              <div className="portfolio-table-shell table-shell">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>标的</th>
                      <th>来源策略</th>
                      <th className="center">建仓日期</th>
                      <th className="center portfolio-col-hold-days">持有天数</th>
                      <th className="right">最新价</th>
                      <th className="right">今日盈亏</th>
                      <th className="right">浮动盈亏</th>
                      <th className="center">当前信号</th>
                      <th style={{ width: 60, textAlign: 'right' }}>动作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openRows.length === 0 ? (
                      <tr className="portfolio-table-empty-row">
                        <td colSpan={8}>
                          <div className="portfolio-empty-state table-empty">
                            <div className="portfolio-empty-title">{data?.tabs.open.emptyTitle}</div>
                            <div className="portfolio-empty-text">{data?.tabs.open.emptyText}</div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      openRows.map((row) => (
                        <tr
                          key={row.id}
                          className={activeOpenRow?.id === row.id ? 'portfolio-table-row selected' : 'portfolio-table-row'}
                          onClick={() => selectOpenRow(row)}
                        >
                          <td>
                            <div className="portfolio-cell-title">{row.name}</div>
                            <div className="portfolio-inline-meta numeric-muted">{row.tsCode}</div>
                          </td>
                          <td>
                            <div>{row.sourceStrategyLabel}</div>
                          </td>
                          <td className="center numeric">{row.openDate}</td>
                          <td className="center numeric portfolio-col-hold-days">{formatHoldDays(row, true)}</td>
                          <td className="right numeric">{row.latestClose?.toFixed(2) ?? '--'}</td>
                          <td className={`right numeric ${row.todayPnl != null && row.todayPnl > 0 ? 'pnl-positive' : row.todayPnl != null && row.todayPnl < 0 ? 'pnl-negative' : 'pnl-muted'}`}>
                            <div>{row.todayPnl != null && row.todayPnl !== 0 ? formatMoney(row.todayPnl) : '0.00'}</div>
                            <div className={`portfolio-inline-meta ${row.todayPnl != null && row.todayPnl > 0 ? 'pnl-positive' : row.todayPnl != null && row.todayPnl < 0 ? 'pnl-negative' : 'pnl-muted'}`}>{row.todayPnl != null && row.todayPnl !== 0 ? formatPercentAlready(row.todayPnlPct) : '0.00%'}</div>
                          </td>
                          <td className={`right numeric ${row.unrealizedPnl != null && row.unrealizedPnl > 0 ? 'pnl-positive' : row.unrealizedPnl != null && row.unrealizedPnl < 0 ? 'pnl-negative' : 'pnl-muted'}`}>
                            <div>{row.unrealizedPnl != null && row.unrealizedPnl !== 0 ? formatMoney(row.unrealizedPnl) : '0.00'}</div>
                            <div className={`portfolio-inline-meta ${row.unrealizedPnl != null && row.unrealizedPnl > 0 ? 'pnl-positive' : row.unrealizedPnl != null && row.unrealizedPnl < 0 ? 'pnl-negative' : 'pnl-muted'}`}>{row.unrealizedPnl != null && row.unrealizedPnl !== 0 ? formatPercent(row.unrealizedPnlPct) : '0.00%'}</div>
                          </td>
                          <td className="center">
                            {(() => {
                              const s = row.rawActionSignal ?? '';
                              const display = row.actionLabel === 'ADD' ? '加入观察' : row.actionLabel;
                              if (!s || s === 'HOLD' || display === '持续持有' || display === '持有') {
                                return (
                                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>
                                    持有
                                  </span>
                                );
                              }
                              if (s === 'REDUCE' || display === '减仓') {
                                return (
                                  <span
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 600,
                                      color: 'var(--warn)',
                                      background: 'rgba(245,158,11,0.08)',
                                      padding: '2px 8px',
                                      borderRadius: 3,
                                    }}
                                  >
                                    减仓
                                  </span>
                                );
                              }
                              if (s === 'CLOSE' || s === 'STOP_LOSS' || display === '清仓' || display === '止损') {
                                return (
                                  <span
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 600,
                                      color: 'var(--critical)',
                                      background: 'rgba(220,38,38,0.08)',
                                      padding: '2px 8px',
                                      borderRadius: 3,
                                    }}
                                  >
                                    {display || '清仓'}
                                  </span>
                                );
                              }
                              return (
                                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                  {display || s || '—'}
                                </span>
                              );
                            })()}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                className="action-icon-btn"
                                title="研究"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const href = buildResearchHref({
                                    source: 'portfolio',
                                    focus: row.tsCode,
                                    strategy: row.sourceStrategy,
                                    tradeDate: selectedDate,
                                    detailRoute: row.sourceStrategy ? 'backtest' : null,
                                    detailKey: row.sourceStrategy,
                                  });
                                  if (href) {
                                    window.open(href, '_blank');
                                  }
                                }}
                              >
                                <FileText size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : null}

            {!loading && !error && activeTab === 'closed' ? (
              <div className="portfolio-table-shell table-shell">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>标的</th>
                      <th>来源策略</th>
                      <th className="center">建仓日期</th>
                      <th className="center">平仓日期</th>
                      <th className="center portfolio-col-hold-days">持有天数</th>
                      <th className="right">已实现盈亏</th>
                      <th>退出原因</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closedRows.length === 0 ? (
                      <tr className="portfolio-table-empty-row">
                        <td colSpan={7}>
                          <div className="portfolio-empty-state table-empty">
                            <div className="portfolio-empty-title">{data?.tabs.closed.emptyTitle}</div>
                            <div className="portfolio-empty-text">{data?.tabs.closed.emptyText}</div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      closedRows.map((row) => (
                        <tr
                          key={row.id}
                          className={activeClosedRow?.id === row.id ? 'portfolio-table-row selected' : 'portfolio-table-row'}
                          onClick={() => selectClosedRow(row)}
                        >
                          <td>
                            <div className="portfolio-cell-title">{row.name}</div>
                            <div className="portfolio-inline-meta numeric-muted">{row.tsCode}</div>
                          </td>
                          <td>
                            <div>{row.sourceStrategyLabel}</div>
                          </td>
                          <td className="center numeric">{row.openDate}</td>
                          <td className="center numeric">{row.closeDate ?? '--'}</td>
                          <td className="center numeric portfolio-col-hold-days">{formatHoldDays(row, false)}</td>
                          <td className={`right numeric ${row.realizedPnl != null && row.realizedPnl > 0 ? 'pnl-positive' : row.realizedPnl != null && row.realizedPnl < 0 ? 'pnl-negative' : ''}`}>
                            <div>{formatMoney(row.realizedPnl)}</div>
                            <div className="portfolio-inline-meta">{formatPercent(row.realizedPnlPct)}</div>
                          </td>
                          <td>{formatSignalReason(row.exitReason)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : null}

            {!loading && !error && activeTab === 'transactions' ? (
              <div className="portfolio-table-shell table-shell">
                <div className="portfolio-transactions-intro">{getTransactionIntro(relatedTsCode, data?.transactions.total ?? transactionRows.length)}</div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>方向</th>
                      <th>成交日期</th>
                      <th>标的</th>
                      <th className="right">成交价格</th>
                      <th className="right">成交数量</th>
                      <th className="right">成交金额</th>
                      <th>触发来源</th>
                      <th>信号类型</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactionRows.length === 0 ? (
                      <tr className="portfolio-table-empty-row">
                        <td colSpan={8}>
                          <div className="portfolio-empty-state table-empty">
                            <div className="portfolio-empty-title">{data?.transactions.emptyTitle}</div>
                            <div className="portfolio-empty-text">{data?.transactions.emptyText}</div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      transactionRows.map((row) => {
                        const isSelected =
                          (portfolioId && String(row.portfolioId) === portfolioId) || (relatedTsCode && row.tsCode === relatedTsCode);
                        return (
                          <tr
                            key={row.id}
                            className={isSelected ? 'portfolio-table-row selected' : 'portfolio-table-row'}
                            onClick={() => selectTransactionRow(row)}
                          >
                            <td>
                              <span className={row.tradeType === 'BUY' ? 'text-buy' : 'text-sell'}>
                                {row.tradeTypeLabel}
                              </span>
                            </td>
                            <td className="numeric">{row.tradeDate}</td>
                            <td>
                              <div className="portfolio-cell-title">{row.name || row.tsCode}</div>
                              <div className="portfolio-inline-meta numeric-muted">{row.tsCode}</div>
                            </td>
                            <td className="right numeric">{row.price.toFixed(2)}</td>
                            <td className="right numeric">{row.shares}</td>
                            <td className="right numeric">{row.amount.toFixed(2)}</td>
                            <td>{row.triggerSourceLabel}</td>
                            <td>{SIGNAL_TYPE_MAP[row.signalType ?? ''] ?? row.signalType ?? '--'}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            ) : null}

            {!loading && error ? (
              <div className="page-error">
                <div className="page-error-msg">页面数据加载失败</div>
                <div className="page-error-detail">{error}</div>
                <button className="retry-btn" onClick={refetch}>
                  重试
                </button>
              </div>
            ) : null}
          </section>
        </div>

        <div ref={contextPanelRef} className="portfolio-context" style={{ width: '340px', flexShrink: 0, overflowY: 'auto', height: '100%' }}>
          <section className="card portfolio-context-card">
            <div className="portfolio-context-body">
              {activeContext ? (
                <PortfolioDetailPanel
                  activeContext={activeContext}
                  activeRow={activeRow}
                  detailSourceMeta={displayDetailSourceMeta}
                  stockContext={stockContext}
                  stockContextLoading={stockContextLoading}
                  onLink={handleRelatedLink}
                  onActionShell={handleActionShell}
                  onOpenKline={
                    activeRow
                      ? () => {
                          setDrawerStock(
                            getMockDetail(
                              activeRow.tsCode,
                              activeRow.name,
                              activeRow.sourceStrategy ? [activeRow.sourceStrategy] : [],
                              activeRow.latestClose ?? 0,
                              activeRow.todayPnlPct ?? 0,
                            ),
                          );
                          setDrawerAvgCost(activeRow.openPrice ?? null);
                        }
                      : undefined
                  }
                />
              ) : (
                <div className="portfolio-context-empty">选择持仓后，可在这里查看详情补充、风险状态和动作承接。</div>
              )}
            </div>
          </section>
        </div>
      </div>

      <StockDrawer
        stock={drawerStock}
        onClose={() => {
          setDrawerStock(null);
          setDrawerAvgCost(null);
        }}
        avgCost={drawerAvgCost}
      />
    </div>
  );
}

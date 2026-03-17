import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  buildRiskContext,
  buildRiskQueryState,
  findRiskDomainByFocus,
  getRiskFocusRows,
  loadRiskWorkspace,
} from '../../adapters/risk';
import SourceBadge from '../../components/data-source/SourceBadge';
import SourceNotice from '../../components/data-source/SourceNotice';
import RiskBreakdownPanel from '../../components/risk/RiskBreakdownPanel';
import RiskEventFlowPanel from '../../components/risk/RiskEventFlowPanel';
import GateBlockPanel from '../../components/risk/GateBlockPanel';
import RiskOverviewStrip from '../../components/risk/RiskOverviewStrip';
import RiskScorePanel from '../../components/risk/RiskScorePanel';
import RiskTabs from '../../components/risk/RiskTabs';
import { useContextPanel } from '../../context/useContextPanel';
import { useDate } from '../../context/useDate';
import { useApiData } from '../../hooks/useApiData';
import type { StockContextPanelPayload } from '../../types/contextPanel';
import type { RiskDomainModel, RiskTab } from '../../types/risk';
import { buildResearchHref } from '../../utils/researchHandoff';

function buildSourceBackHref(source: string, focus: string | null, scope: string, strategy: string | null): string | null {
  if (source === 'dashboard') return '/dashboard';
  if (source === 'signals') {
    return `/signals?source=risk${focus ? `&focus=${encodeURIComponent(focus)}` : ''}${strategy ? `&strategy=${encodeURIComponent(strategy)}` : ''}`;
  }
  if (source === 'watchlist') {
    return `/watchlist?source=risk${focus ? `&focus=${encodeURIComponent(focus)}` : ''}&view=table`;
  }
  if (source === 'portfolio') {
    return `/portfolio?source=risk${focus ? `&focus=${encodeURIComponent(focus)}` : ''}${scope === 'portfolio' ? '&tab=open' : ''}`;
  }
  return null;
}

function buildRiskContextPanelPayload(
  row: RiskDomainModel,
  context: ReturnType<typeof buildRiskContext>,
  tradeDate: string,
): StockContextPanelPayload {
  const strategyHref = row.sourceStrategy ? buildSourceBackHref('signals', row.tsCode, 'all', row.sourceStrategy) : null;

  return {
    title: row.name,
    name: row.name,
    tsCode: row.tsCode,
    sourceStrategy: row.sourceStrategy,
    subtitle: row.tradeAllowedLabel,
    summary: context?.recommendedNextStep ?? row.recommendedPositionText,
    tags: [
      { label: row.riskLevelLabel, tone: 'state' },
      { label: row.tradeAllowedLabel, tone: row.tradeAllowed ? 'source' : 'state' },
      ...(row.sourceStrategy ? [{ label: row.sourceStrategy, tone: 'strategy' as const }] : []),
      ...(row.inWatchlist ? [{ label: '交易标的池', tone: 'source' as const }] : []),
      ...(row.inPortfolio ? [{ label: '持仓中心', tone: 'source' as const }] : []),
    ],
    summaryItems: [
      { label: '风险等级', value: row.riskLevelLabel },
      { label: '交易结论', value: row.tradeAllowedLabel },
      { label: '来源策略', value: context?.sourceStrategyLabel ?? '--' },
      { label: '拦截原因', value: row.blockReason || '--' },
      { label: '建议仓位', value: row.recommendedPositionText },
    ],
    actions: [
      {
        label: '进入研究中心',
        href: buildResearchHref({
          source: 'risk',
          focus: row.tsCode,
          strategy: row.sourceStrategy,
          riskLevel: row.riskLevel,
          tradeDate,
          detailRoute: row.sourceStrategy ? 'backtest' : null,
          detailKey: row.sourceStrategy,
        }),
        note: '查看该对象对应的研究承接。',
      },
      {
        label: '进入交易标的池',
        href: row.inWatchlist ? `/watchlist?source=risk&focus=${encodeURIComponent(row.tsCode)}&view=table` : undefined,
        disabled: !row.inWatchlist,
        note: row.inWatchlist ? '返回交易标的池查看当前对象。' : '当前对象不在交易标的池中。',
      },
      {
        label: '进入持仓中心',
        href: row.inPortfolio ? `/portfolio?source=risk&focus=${encodeURIComponent(row.tsCode)}` : undefined,
        disabled: !row.inPortfolio,
        note: row.inPortfolio ? '返回持仓中心查看当前对象。' : '当前对象不在持仓中。',
      },
      {
        label: '进入策略页',
        href: strategyHref ?? undefined,
        disabled: !strategyHref,
        note: strategyHref ? '返回该对象的来源策略页。' : '当前对象没有可返回的策略页。',
      },
    ],
  };
}

export default function RiskPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedDate } = useDate();
  const queryState = buildRiskQueryState(searchParams);
  const [selectedFocusState] = useState<string | null>(queryState.focus);
  const [feedback, setFeedbackState] = useState<{ tone: 'info' | 'warning'; text: string } | null>(null);
  const { openPanel, closePanel } = useContextPanel();

  const stableFetchKey = useMemo(
    () => `${selectedDate ?? ''}|${queryState.tab}|${queryState.source ?? ''}|${queryState.scope ?? ''}`,
    [selectedDate, queryState.tab, queryState.source, queryState.scope],
  );
  const { data, loading, error, refetch } = useApiData(
    () => loadRiskWorkspace(queryState, selectedDate),
    [stableFetchKey],
  );

  const activeRows = useMemo(() => (data ? getRiskFocusRows(data, queryState.tab) : []), [data, queryState.tab]);
  const focusRow = useMemo(
    () => (queryState.focus ? activeRows.find((row) => row.tsCode === queryState.focus) ?? null : null),
    [activeRows, queryState.focus],
  );
  const selectedFocus = queryState.tab === 'breakdown'
    ? queryState.focus
    : focusRow?.tsCode ?? activeRows[0]?.tsCode ?? selectedFocusState;
  const focusMissNote = queryState.tab !== 'breakdown'
    && queryState.focus
    && activeRows.length > 0
    && !focusRow
    ? `未找到焦点对象 ${queryState.focus}，已回退到当前 Tab 的首个对象。`
    : null;
  const setSelectedFocus: (tsCode: string | null) => void = () => {};
  const setFeedback: (value: { tone: 'info' | 'warning'; text: string } | null) => void = () => {};

  useEffect(() => {
    if (queryState.tab === 'breakdown') {
      setSelectedFocus(queryState.focus);
      return;
    }

    if (!activeRows.length) {
      setSelectedFocus(null);
      return;
    }

    const focusRow = queryState.focus ? activeRows.find((row) => row.tsCode === queryState.focus) : null;
    if (focusRow) {
      setSelectedFocus(focusRow.tsCode);
      return;
    }

    if (queryState.focus) {
      setFeedback({ tone: 'warning', text: `未找到焦点对象 ${queryState.focus}，已回退到当前 Tab 的首个对象。` });
    }

    setSelectedFocus(activeRows[0].tsCode);
  }, [activeRows, queryState.focus, queryState.tab]);

  const activeDomain = useMemo(
    () => (data ? findRiskDomainByFocus(data.domainRows, selectedFocus ?? queryState.focus) : null),
    [data, queryState.focus, selectedFocus],
  );
  const activeBreakdownRow = useMemo(
    () => data?.breakdownRows.find((row) => row.tsCode === (selectedFocus ?? queryState.focus ?? '')) ?? null,
    [data, queryState.focus, selectedFocus],
  );
  const context = useMemo(() => buildRiskContext(activeDomain), [activeDomain]);
  const activeDataSource = data?.dataSources[queryState.tab];

  useEffect(() => {
    if (!activeDomain || !context) {
      closePanel();
      return;
    }

    openPanel({
      entityType: 'stock',
      entityKey: activeDomain.tsCode,
      sourcePage: 'risk',
      focus: activeDomain.tsCode,
      activeTab: queryState.tab,
      payloadVersion: 'v1',
      payload: buildRiskContextPanelPayload(activeDomain, context, activeDomain.tradeDate ?? selectedDate),
    });
  }, [activeDomain, context, queryState.tab, openPanel, closePanel, selectedDate]);

  useEffect(() => () => closePanel(), [closePanel]);

  const listRef = useRef<HTMLDivElement>(null);
  const scrollPosRef = useRef(0);

  useEffect(() => {
    if (listRef.current && scrollPosRef.current > 0) {
      listRef.current.scrollTop = scrollPosRef.current;
    }
  }, [data, selectedFocus]);

  const syncParams = (updater: (params: URLSearchParams) => void) => {
    const next = new URLSearchParams(searchParams);
    updater(next);
    setSearchParams(next, { replace: true });
  };

  const handleTabChange = (tab: RiskTab) => {
    syncParams((params) => {
      if (tab === 'gate') params.delete('tab');
      else params.set('tab', tab);
      if (selectedFocus) params.set('focus', selectedFocus);
    });
  };

  const handleFocusChange = (tsCode: string) => {
    if (listRef.current) scrollPosRef.current = listRef.current.scrollTop;
    setSelectedFocus(tsCode);
    setFeedbackState(null);
    syncParams((params) => {
      params.set('focus', tsCode);
    });
  };

  const openBreakdown = (tsCode: string) => {
    if (listRef.current) scrollPosRef.current = listRef.current.scrollTop;
    setSelectedFocus(tsCode);
    setFeedbackState(null);
    syncParams((params) => {
      params.set('tab', 'breakdown');
      params.set('focus', tsCode);
    });
  };

  const openHref = (href: string | null, emptyMessage: string) => {
    if (!href) {
      setFeedbackState({ tone: 'warning', text: emptyMessage });
      return;
    }
    navigate(href);
  };

  return (
    <div className="risk-page" data-testid="risk-page" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <RiskOverviewStrip metrics={data?.metrics ?? []} />

      {data ? <RiskTabs activeTab={queryState.tab} tabs={data.tabs} onChange={handleTabChange} /> : null}

      <div className="risk-layout" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div className="risk-main" style={{ flex: 1, minHeight: 0 }}>
          <section className="card" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div className="card-header">
              <div className="source-card-head">
                <span className="card-title">{data?.tabs[queryState.tab].title ?? '风险视图'}</span>
              </div>
              <SourceBadge meta={activeDataSource} showWhenReal />
            </div>

            {!loading && !error ? (
              <div className="card-body" style={{ paddingTop: 12, paddingBottom: 0 }}>
                <SourceNotice meta={activeDataSource} showWhenReal />
              </div>
            ) : null}

            <div ref={listRef} className="risk-list-container" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {loading ? (
              <div className="risk-loading-state">
                <div className="spinner" />
                <span>正在加载风险数据...</span>
              </div>
            ) : null}

            {!loading && error ? (
              <div className="page-error">
                <div className="page-error-msg">风险数据加载失败</div>
                <div className="page-error-detail">{error}</div>
                <button className="retry-btn" onClick={refetch}>重试</button>
              </div>
            ) : null}

            {!loading && !error && (feedback || focusMissNote) ? <div className="risk-miss-banner">{feedback?.text ?? focusMissNote}</div> : null}

            {!loading && !error && data && queryState.tab === 'gate' ? (
              <GateBlockPanel
                rows={data.gateRows}
                selectedFocus={selectedFocus}
                onSelect={handleFocusChange}
                onOpenBreakdown={openBreakdown}
                onOpenSource={(href) => openHref(href, '当前对象没有可返回的来源页。')}
                emptyTitle={data.tabs.gate.emptyTitle}
                emptyText={data.tabs.gate.emptyText}
              />
            ) : null}

            {!loading && !error && data && queryState.tab === 'scores' ? (
              <RiskScorePanel
                rows={data.scoreRows}
                selectedFocus={selectedFocus}
                onSelect={handleFocusChange}
                onOpenBreakdown={openBreakdown}
                onOpenWatchlist={(href) => openHref(href, '当前对象不在交易标的池中。')}
                onOpenPortfolio={(href) => openHref(href, '当前对象不在持仓中。')}
                emptyTitle={data.tabs.scores.emptyTitle}
                emptyText={data.tabs.scores.emptyText}
              />
            ) : null}

            {!loading && !error && data && queryState.tab === 'breakdown' ? (
              <RiskBreakdownPanel
                row={activeBreakdownRow}
                emptyTitle={data.tabs.breakdown.emptyTitle}
                emptyText={data.tabs.breakdown.emptyText}
              />
            ) : null}

            {!loading && !error && data && queryState.tab === 'events' ? (
              <RiskEventFlowPanel
                rows={data.eventRows}
                selectedFocus={selectedFocus}
                onSelect={handleFocusChange}
                emptyTitle={data.tabs.events.emptyTitle}
                emptyText={data.tabs.events.emptyText}
              />
            ) : null}
            </div>
          </section>
        </div>

      </div>
    </div>
  );
}

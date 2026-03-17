interface ResearchHandoffInput {
  tab?: 'summary' | 'ic' | 'attribution' | 'resonance';
  source: 'dashboard' | 'signals' | 'watchlist' | 'portfolio' | 'risk' | 'execution' | 'direct';
  focus?: string | null;
  strategy?: string | null;
  riskLevel?: string | null;
  resonance?: string | null;
  tradeDate?: string | null;
  detailRoute?: 'backtest' | 'factor-ic' | 'attribution' | 'resonance' | null;
  detailKey?: string | null;
}

export function buildResearchHref(input: ResearchHandoffInput): string {
  const params = new URLSearchParams();

  const routeTab =
    input.detailRoute === 'factor-ic'
      ? 'ic'
      : input.detailRoute === 'attribution'
        ? 'attribution'
        : input.detailRoute === 'resonance'
          ? 'resonance'
          : input.detailRoute === 'backtest'
            ? 'summary'
            : input.tab;

  if (routeTab && routeTab !== 'summary') params.set('tab', routeTab);
  if (input.source && input.source !== 'direct') params.set('source', input.source);
  if (input.focus) params.set('focus', input.focus);
  if (input.strategy) params.set('strategy', input.strategy);
  if (input.riskLevel) params.set('risk_level', input.riskLevel);
  if (input.resonance) params.set('resonance', input.resonance);
  if (input.tradeDate) params.set('trade_date', input.tradeDate);

  const query = params.toString();
  if (input.detailRoute && input.detailKey?.trim()) {
    const detailPath = `/research/${input.detailRoute}/${encodeURIComponent(input.detailKey.trim())}`;
    return query ? `${detailPath}?${query}` : detailPath;
  }

  return query ? `/research?${query}` : '/research';
}

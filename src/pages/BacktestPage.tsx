import { Navigate, useSearchParams } from 'react-router-dom';
import { normalizeResearchSource } from '../adapters/research';
import { buildResearchBaseHref, buildResearchDetailHref } from '../adapters/researchDetail';

export default function BacktestPage() {
  const [searchParams] = useSearchParams();
  const strategy = searchParams.get('strategy');
  const detailKey = searchParams.get('detailKey') ?? strategy;

  const query = {
    source: normalizeResearchSource(searchParams.get('source')),
    focus: searchParams.get('focus'),
    strategy: detailKey,
    riskLevel: searchParams.get('risk_level'),
    resonance: searchParams.get('resonance'),
    tradeDate: searchParams.get('trade_date'),
  };

  if (detailKey) {
    return <Navigate to={buildResearchDetailHref('backtest', detailKey, query)} replace />;
  }

  return <Navigate to={buildResearchBaseHref(query)} replace />;
}

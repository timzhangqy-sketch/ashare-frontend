export const legacyRoutes = {
  ignition: '/ignition',
  ignitionWithQuery: '/ignition?source=watchlist&ts_code=300264.SZ&focus=300264.SZ&strategy=VOL_SURGE',
  holdings: '/holdings',
  holdingsWithQuery: '/holdings?source=dashboard&focus=300264.SZ',
  backtestWithStrategy: '/backtest?strategy=VOL_SURGE',
  backtestWithDetailKey: '/backtest?detailKey=VOL_SURGE',
  backtestFromWatchlist: '/backtest?strategy=VOL_SURGE&source=watchlist',
  backtestFromPortfolio: '/backtest?detailKey=VOL_SURGE&source=portfolio',
  backtestRiskNoKey: '/backtest?source=risk',
  backtestRichNoKey: '/backtest?source=risk&focus=300264.SZ&resonance=2&risk_level=high&trade_date=2026-03-09',
  backtestRichWithKey:
    '/backtest?detailKey=VOL_SURGE&source=portfolio&focus=300264.SZ&resonance=2&risk_level=high&trade_date=2026-03-09',
};

export const PORTFOLIO_META: Record<string, { logic: string; source: string; script: string }> = {
  kpi: {
    logic: '模拟组合KPI：NAV/初始本金/累计收益/年化/市值/现金/浮盈/开始日期/持仓数/现金比例/最大回撤/同期基准',
    source: 'GET /api/portfolio/summary',
    script: 'portfolio_tracker.py → routers/portfolio.py → summary()',
  },
  strategy_stats: {
    logic: '按策略分组统计已平仓记录：笔数/胜率/平均收益/总盈亏/均持天数/最佳/最差/盈亏比',
    source: 'GET /api/portfolio/stats → strategy_summary',
    script: 'sim_engine.py(平仓) → routers/portfolio.py → get_portfolio_stats()',
  },
  top_winners: {
    logic: '已平仓中盈利最大的10笔（按回报率降序）',
    source: 'GET /api/portfolio/stats → top_winners',
    script: 'sim_engine.py(平仓) → routers/portfolio.py → get_portfolio_stats()',
  },
  top_losers: {
    logic: '已平仓中亏损最大的10笔（按回报率升序）',
    source: 'GET /api/portfolio/stats → top_losers',
    script: 'sim_engine.py(平仓) → routers/portfolio.py → get_portfolio_stats()',
  },
  strategy_distribution: {
    logic: '当前持仓按来源策略分组统计占比',
    source: 'GET /api/portfolio/distribution → strategy_distribution',
    script: 'routers/portfolio.py → get_distribution()',
  },
  industry_distribution: {
    logic: '当前持仓按行业分组统计占比（Top5+其他）',
    source: 'GET /api/portfolio/distribution → industry_distribution',
    script: 'routers/portfolio.py → get_distribution()',
  },
  open_positions: {
    logic: '当前open持仓明细：建仓日期/持有天数/最新价/今日盈亏/浮动盈亏/当前信号',
    source: 'GET /api/portfolio/positions → status=open',
    script: 'portfolio_tracker.py(每日更新持仓) → routers/portfolio.py',
  },
  closed_positions: {
    logic: '已平仓记录：建仓→平仓日期/持有天数/已实现盈亏/退出原因',
    source: 'GET /api/portfolio/positions → status=closed',
    script: 'sim_engine.py(平仓写入) → routers/portfolio.py',
  },
  transactions: {
    logic: '全部已成交的模拟订单流水（买入+卖出），按成交日期倒序',
    source: 'GET /api/portfolio/transactions',
    script: 'sim_engine.py(生成+填充订单) → routers/portfolio.py → get_all_transactions()',
  },
};

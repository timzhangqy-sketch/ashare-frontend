export const DASHBOARD_META: Record<string, { logic: string; source: string; script: string }> = {
  market_opinions: {
    logic: '微博财经博主观点聚合，DeepSeek生成标题，每日自动抓取',
    source: 'ashare_market_opinions',
    script: 'weibo_fetcher.py',
  },
  action_list: {
    logic: '今日待买入/待卖出/新关注信号',
    source: '/api/dashboard/action_list',
    script: 'routers/dashboard.py → action_list()',
  },
  concept_heat: {
    logic: '同花顺概念热度榜 Top10，含连续上榜天数和3日动量',
    source: 'ashare_ths_hot_concept + ashare_concept_daily_stats',
    script: 'ths_hot_daily.py + concept_daily_stats.py',
  },
  turnover_chart: {
    logic: '沪深两市成交额60日走势，叠加市场宽度评分曲线和等权平均涨幅曲线，底部为11档涨跌分布',
    source: 'ashare_market_turnover + ashare_market_breadth + ashare_market_distribution',
    script: 'index_turnover_update.py + market_breadth_update.py + concept_daily_stats.py',
  },
  hot_stocks: {
    logic: '同花顺热股榜 Top10，含策略命中和板块势',
    source: 'ashare_ths_hot_stock',
    script: 'ths_hot_daily.py',
  },
  momentum: {
    logic: '近3日动量最强的板块 Top10（按3日涨幅累计排序）',
    source: 'ashare_concept_daily_stats',
    script: 'concept_daily_stats.py → /api/concept-stats/top-momentum',
  },
  surge: {
    logic: '近3日放量但涨幅不大的板块 Top5（按量比排序，排除动量前5）',
    source: 'ashare_concept_daily_stats',
    script: 'concept_daily_stats.py → /api/concept-stats/surge',
  },
  retreat: {
    logic: '前3日强势→今日回落的板块 Top5（前期动量>0且今日反转）',
    source: 'ashare_concept_daily_stats',
    script: 'concept_daily_stats.py → /api/concept-stats/retreat',
  },
  resonance: {
    logic: '板块×策略共振：策略触发的股票与强势板块的交叉命中',
    source: 'ashare_concept_daily_stats + ashare_watchlist',
    script: '/api/concept-stats/resonance',
  },
  opportunity: {
    logic: '今日买点信号汇总（来自四个策略的触发）',
    source: 'ashare_watchlist (buy_signal)',
    script: 'routers/signals.py → buy()',
  },
  risk_alerts: {
    logic: '风控提示：Gate拦截数 + 高风险持仓',
    source: 'ashare_risk_score + ashare_portfolio',
    script: 'risk_scorer.py → routers/dashboard.py',
  },
  portfolio_overview: {
    logic: '模拟组合概览：NAV/收益/持仓/回撤/基准对比',
    source: 'ashare_portfolio + ashare_sim_portfolio_snapshot',
    script: 'portfolio_tracker.py → /api/portfolio/summary',
  },
  system_health: {
    logic: '今日Pipeline运行状态和数据覆盖率',
    source: '/api/system/pipeline_runs + /api/health',
    script: 'daily_pipeline.sh → routers/system.py',
  },
  fund_flow: {
    logic: '基于板块成交额3日环比变化，放量（环比>1.2x）且上涨=资金流入，放量且下跌=资金流出。排除指数类板块和低成交板块。',
    source: 'ashare_concept_daily_stats',
    script: 'concept_daily_stats.py → /api/concept-stats/fund-flow',
  },
};

import type {
  DashboardLoadState,
  DashboardSummaryDto,
} from '../types/dashboard';

export const dashboardHealthyMock: DashboardSummaryDto = {
  tradeDate: '2026-03-06',
  generatedAt: '2026-03-06T18:42:00',
  versionSnapshot: 'frontend-round2-mock-healthy',
  todayChanges: {
    newSignals: 18,
    removedSignals: 7,
    watchlistDelta: 5,
    portfolioDelta: 1,
    riskAlertsDelta: 2,
    systemAlertsDelta: 0,
    summaryText: '今天新增信号仍然活跃，机会端有新增候选，风险侧出现少量提醒，系统整体稳定。',
  },
  opportunity: {
    buySignalsCount: 12,
    resonanceCount: 4,
    watchlistCandidates: 9,
    strongestStrategyLabel: 'VOL_SURGE',
    hottestSectorLabel: '算力基础设施',
    actionableCount: 6,
    topOpportunities: [
      {
        tsCode: '300001.SZ',
        name: '算力样本 A',
        strategyLabel: 'VOL_SURGE',
        sectorLabel: '算力基础设施',
        score: 87.67,
        hint: '量价配合较完整，优先进入盘中关注名单。',
      },
      {
        tsCode: '300002.SZ',
        name: '异动样本 B',
        strategyLabel: 'RETOC2',
        sectorLabel: '机器人',
        score: 81.67,
        hint: '异动持续性尚可，等待下一次确认。',
      },
      {
        tsCode: '300003.SZ',
        name: '形态样本 C',
        strategyLabel: 'PATTERN_T2UP9',
        sectorLabel: '医药',
        score: 78.33,
        hint: '形态接近临界位，需结合盘中量能再判断。',
      },
    ],
  },
  risk: {
    gateBlockedCount: 3,
    highRiskWatchlistCount: 2,
    highRiskPositionsCount: 1,
    newRiskEventsCount: 2,
    highestRiskName: '高波动样本 X',
    highestRiskScore: 84.17,
    riskHint: '高风险暴露主要集中在单一高波动标的，建议优先检查仓位和止损条件。',
  },
  portfolio: {
    positionType: 'PAPER',
    positionsCount: 6,
    totalMarketValue: 1286000,
    cashRatio: 0.31,
    dailyPnl: 28600,
    dailyPnlPct: 0.0228,
    cumulativePnlPct: 0.137,
    concentrationTop1: 0.26,
    sellSignalsCount: 2,
    actionHint: '组合日内小幅盈利，但仍有两处卖点提示，需关注仓位收敛和止盈节奏。',
  },
  systemHealth: {
    pipelineStatus: 'healthy',
    latestSuccessTime: '2026-03-06T18:35:00',
    failedStepsCount: 0,
    dataCoveragePct: 0.98,
    dqStatus: 'healthy',
    apiHealthStatus: 'healthy',
    versionLabel: 'mock-r2.1',
    systemHint: '今日 Pipeline 正常完成，数据覆盖和 API 健康状态都在可接受范围内。',
  },
};

export const dashboardWarningMock: DashboardSummaryDto = {
  ...dashboardHealthyMock,
  versionSnapshot: 'frontend-round2-mock-warning',
  todayChanges: {
    ...dashboardHealthyMock.todayChanges,
    riskAlertsDelta: 4,
    systemAlertsDelta: 2,
    summaryText: '机会仍有承接，但风险和系统提醒同时抬升，建议优先检查风控与运行状态。',
  },
  opportunity: {
    ...dashboardHealthyMock.opportunity,
    actionableCount: 4,
    hottestSectorLabel: '新能源设备',
  },
  risk: {
    gateBlockedCount: 5,
    highRiskWatchlistCount: 4,
    highRiskPositionsCount: 2,
    newRiskEventsCount: 4,
    highestRiskName: '高波动样本 Y',
    highestRiskScore: 91.0,
    riskHint: '高风险持仓与交易标的池样本同时增加，建议优先执行风控复核。',
  },
  portfolio: {
    ...dashboardHealthyMock.portfolio,
    dailyPnl: -12600,
    dailyPnlPct: -0.0102,
    sellSignalsCount: 3,
    actionHint: '组合转入谨慎状态，建议优先处理卖点信号和高波动仓位。',
  },
  systemHealth: {
    pipelineStatus: 'warning',
    latestSuccessTime: '2026-03-06T18:21:00',
    failedStepsCount: 1,
    dataCoveragePct: 0.93,
    dqStatus: 'warning',
    apiHealthStatus: 'healthy',
    versionLabel: 'mock-r2.1-warning',
    systemHint: '系统仍可用，但有一处失败步骤和一处数据覆盖不足需要排查。',
  },
};

export const dashboardEmptyMock: DashboardSummaryDto = {
  tradeDate: '2026-03-06',
  generatedAt: '2026-03-06T18:42:00',
  versionSnapshot: 'frontend-round2-mock-empty',
  todayChanges: {
    newSignals: 0,
    removedSignals: 0,
    watchlistDelta: 0,
    portfolioDelta: 0,
    riskAlertsDelta: 0,
    systemAlertsDelta: 0,
    summaryText: '当前交易日暂无可展示的 Dashboard 汇总变化。',
  },
  opportunity: {
    buySignalsCount: 0,
    resonanceCount: 0,
    watchlistCandidates: 0,
    strongestStrategyLabel: '无',
    hottestSectorLabel: '无',
    actionableCount: 0,
    topOpportunities: [],
  },
  risk: {
    gateBlockedCount: 0,
    highRiskWatchlistCount: 0,
    highRiskPositionsCount: 0,
    newRiskEventsCount: 0,
    highestRiskName: '无',
    highestRiskScore: 0,
    riskHint: '当前没有新增风险事件。',
  },
  portfolio: {
    positionType: 'PAPER',
    positionsCount: 0,
    totalMarketValue: 0,
    cashRatio: 1,
    dailyPnl: 0,
    dailyPnlPct: 0,
    cumulativePnlPct: 0,
    concentrationTop1: 0,
    sellSignalsCount: 0,
    actionHint: '当前没有组合摘要，可能尚未生成持仓口径或今天暂无动作。',
  },
  systemHealth: {
    pipelineStatus: 'healthy',
    latestSuccessTime: '2026-03-06T18:35:00',
    failedStepsCount: 0,
    dataCoveragePct: 0.97,
    dqStatus: 'healthy',
    apiHealthStatus: 'healthy',
    versionLabel: 'mock-r2.1-empty',
    systemHint: '系统本身正常，但当前没有新的摘要数据。',
  },
};

export function fetchMockDashboardSummary(
  state: Exclude<DashboardLoadState, 'loading'>,
): Promise<DashboardSummaryDto> {
  return new Promise((resolve, reject) => {
    window.setTimeout(() => {
      if (state === 'error') {
        reject(new Error('Dashboard mock 加载失败，请重试或切换到其他状态。'));
        return;
      }

      if (state === 'empty') {
        resolve(dashboardEmptyMock);
        return;
      }

      if (state === 'warning') {
        resolve(dashboardWarningMock);
        return;
      }

      resolve(dashboardHealthyMock);
    }, 320);
  });
}

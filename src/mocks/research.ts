import type {
  AttributionRaw,
  BacktestDetailRaw,
  BacktestSummaryRaw,
  FactorIcRaw,
  ResonanceRaw,
} from '../types/research';

export const researchBacktestSummaryMock: BacktestSummaryRaw[] = [
  {
    strategy: 'VOL_SURGE',
    sample_n: 124,
    t1_avg_return: 1.2,
    t3_avg_return: 2.6,
    t5_avg_return: 3.8,
    t10_avg_return: 5.6,
    t20_avg_return: 7.2,
    win_rate: 58.6,
    drawdown: -4.8,
    version_snapshot: 'bt_20260309_r1',
  },
  {
    strategy: 'RETOC2',
    sample_n: 86,
    t1_avg_return: 0.9,
    t3_avg_return: 1.8,
    t5_avg_return: 2.9,
    t10_avg_return: 4.2,
    t20_avg_return: 6.1,
    win_rate: 61.4,
    drawdown: -3.9,
    version_snapshot: 'bt_20260309_r1',
  },
  {
    strategy: 'PATTERN_T2UP9',
    sample_n: 73,
    t1_avg_return: 0.6,
    t3_avg_return: 1.4,
    t5_avg_return: 2.4,
    t10_avg_return: 3.8,
    t20_avg_return: 5.3,
    win_rate: 55.2,
    drawdown: -5.2,
    version_snapshot: 'bt_20260309_r1',
  },
];

export const researchBacktestDetailMock: BacktestDetailRaw[] = [
  {
    ts_code: '300264.SZ',
    name: '佳创视讯',
    strategy: 'VOL_SURGE',
    entry_date: '2026-03-03',
    entry_price: 18.42,
    ret_t1: 1.3,
    ret_t3: 3.1,
    ret_t5: 5.8,
    ret_t10: 7.4,
    result_t5: 'win',
  },
  {
    ts_code: '600519.SH',
    name: '贵州茅台',
    strategy: 'RETOC2',
    entry_date: '2026-02-25',
    entry_price: 1488.0,
    ret_t1: 0.5,
    ret_t3: 1.9,
    ret_t5: 2.6,
    ret_t10: 4.4,
    ret_t20: 7.1,
    result_t5: 'pending',
  },
];

export const researchFactorIcMock: FactorIcRaw[] = [
  { factor_name: 'VR', horizon: 'T5', ic: 0.061, icir: 0.72, bucket: 'Q5 > Q1', corr_placeholder: '与成交额弱正相关' },
  { factor_name: '换手率', horizon: 'T5', ic: 0.048, icir: 0.55, bucket: 'Q4 > Q2', corr_placeholder: '与波动率中等相关' },
  { factor_name: 'RS 强度', horizon: 'T10', ic: 0.073, icir: 0.81, bucket: 'Q5 > Q1', corr_placeholder: '与趋势延续正相关' },
  { factor_name: '量比', horizon: 'T3', ic: 0.039, icir: 0.41, bucket: 'Q4 > Q1', corr_placeholder: '与短线强弱相关' },
];

export const researchAttributionMock: AttributionRaw[] = [
  { group_type: 'strategy', group_key: 'VOL_SURGE', sample_n: 124, avg_return: 3.8, win_rate: 58.6, drawdown: -4.8 },
  { group_type: 'strategy', group_key: 'RETOC2', sample_n: 86, avg_return: 2.9, win_rate: 61.4, drawdown: -3.9 },
  { group_type: 'strategy', group_key: 'PATTERN', sample_n: 73, avg_return: 2.4, win_rate: 55.2, drawdown: -5.2 },
  { group_type: 'market', group_key: '成长风格', sample_n: 96, avg_return: 4.6, win_rate: 63.1, drawdown: -3.3 },
  { group_type: 'market', group_key: '价值风格', sample_n: 112, avg_return: 2.1, win_rate: 51.8, drawdown: -4.9 },
  { group_type: 'style', group_key: '高换手', sample_n: 88, avg_return: 4.1, win_rate: 60.7, drawdown: -5.5 },
];

export const researchResonanceMock: ResonanceRaw[] = [
  { ts_code: '000001.SZ', name: '平安银行', strategies: ['IGNITE', 'RETOC2'], strategy_count: 2, avg_score: 2.4 },
  { ts_code: '000002.SZ', name: '万科A', strategies: ['IGNITE', 'PATTERN'], strategy_count: 2, avg_score: 1.9 },
  { ts_code: '600000.SH', name: '浦发银行', strategies: ['RETOC2', 'PATTERN', 'IGNITE'], strategy_count: 3, avg_score: 3.1 },
];

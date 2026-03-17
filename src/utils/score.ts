import type { DimScore, HardGate, StockDetail } from '../types/stock';

/* ── Color thresholds ── */
export function scoreColor(score: number): string {
  if (score >= 85) return '#36cfc9'; // cyan
  if (score >= 70) return '#52c41a'; // green
  if (score >= 55) return '#f5a623'; // gold
  return '#ff4d4f';                  // red
}

export function scoreBgColor(score: number): string {
  if (score >= 85) return 'rgba(54, 207, 201, 0.14)';
  if (score >= 70) return 'rgba(82, 196, 26, 0.14)';
  if (score >= 55) return 'rgba(245, 166, 35, 0.14)';
  return 'rgba(255, 77, 79, 0.14)';
}

/* ── Reason generation per dimension ── */
type LevelFn = (score: number, val: string) => string;
const DIM_COPY: Record<string, [LevelFn, LevelFn, LevelFn]> = {
  // [high≥70, mid≥55, low<55]
  'VR量比': [
    (s, v) => `量能优异：量比得分 ${s}/100，实际量比 ${v}，主力积极建仓，放量趋势明确`,
    (s, v) => `量能适中：量比得分 ${s}/100，实际量比 ${v}，成交量正常`,
    (s, v) => `量能不足：量比得分 ${s}/100，实际量比 ${v}，缩量明显，需警惕假突破`,
  ],
  '换手率': [
    (s, v) => `换手活跃：换手率得分 ${s}/100，今日换手 ${v}，筹码交换充分，流动性强`,
    (s, v) => `换手适中：换手率得分 ${s}/100，今日换手 ${v}`,
    (s, v) => `换手低迷：换手率得分 ${s}/100，今日换手 ${v}，流动性偏弱，关注出量`,
  ],
  '20日收益': [
    (s, v) => `中期强势：20日收益得分 ${s}/100，区间涨幅 ${v}，中期上行趋势明确`,
    (s, v) => `中期平稳：20日收益得分 ${s}/100，区间涨幅 ${v}`,
    (s, v) => `中期偏弱：20日收益得分 ${s}/100，区间涨幅 ${v}，趋势待确认`,
  ],
  'RS强度': [
    (s, v) => `强势领涨：RS强度得分 ${s}/100，相对强度指数 ${v}，显著强于大盘，龙头效应明显`,
    (s, v) => `同步大盘：RS强度得分 ${s}/100，相对强度指数 ${v}`,
    (s, v) => `跑输大盘：RS强度得分 ${s}/100，相对强度指数 ${v}，个股偏弱，需观察`,
  ],
  'MA5斜率': [
    (s, v) => `均线向上：MA5斜率得分 ${s}/100，斜率值 ${v}，短期趋势强劲，多头排列`,
    (s, v) => `均线平稳：MA5斜率得分 ${s}/100，斜率值 ${v}`,
    (s, v) => `均线走平：MA5斜率得分 ${s}/100，斜率值 ${v}，短期动能趋弱`,
  ],
};

export interface Reason {
  text:  string;
  score: number;
  color: string;
}

export function generateReasons(dims: DimScore[]): Reason[] {
  return dims.map(d => {
    const fns = DIM_COPY[d.name];
    if (!fns) return { text: d.name, score: d.score, color: scoreColor(d.score) };
    const text = d.score >= 70 ? fns[0](d.score, d.value)
               : d.score >= 55 ? fns[1](d.score, d.value)
               :                  fns[2](d.score, d.value);
    return { text, score: d.score, color: scoreColor(d.score) };
  });
}

/* ── Deterministic mock score from stock code ── */
function seededRand(code: string, idx: number): number {
  let h = idx * 7919;
  for (const c of code) h = ((h << 5) - h + c.charCodeAt(0)) & 0x7fffffff;
  return (Math.abs(h) % 1000) / 1000;
}

const DIM_DEFS: {
  key: string; name: string;
  valFn: (r: number) => string;
  lo: number; hi: number; // score range for this dim
}[] = [
  { key: 'volRatio',   name: 'VR量比',  valFn: r => `${(1.5 + r * 7.5).toFixed(1)}x`,  lo: 48, hi: 99 },
  { key: 'turnover',   name: '换手率',  valFn: r => `${(1 + r * 14).toFixed(1)}%`,       lo: 42, hi: 96 },
  { key: 'return20d',  name: '20日收益',valFn: r => `+${(r * 28).toFixed(1)}%`,          lo: 44, hi: 97 },
  { key: 'rs',         name: 'RS强度',  valFn: r => `${(65 + r * 35).toFixed(1)}`,       lo: 50, hi: 98 },
  { key: 'ma5Slope',   name: 'MA5斜率', valFn: r => `${(r * 0.09).toFixed(4)}`,          lo: 40, hi: 95 },
];

export function getMockDetail(
  code: string,
  name: string,
  lists: string[],
  close: number,
  changePct: number,
): StockDetail {
  const dims: DimScore[] = DIM_DEFS.map((d, i) => {
    const r = seededRand(code, i);
    const score = Math.round(d.lo + r * (d.hi - d.lo));
    return { key: d.key, name: d.name, score, value: d.valFn(r) };
  });

  // Derived amounts for gate checks
  const amtBillion = parseFloat((close * 0.12 + seededRand(code, 9) * 30 + 5).toFixed(1));

  const gates: HardGate[] = [
    {
      label:  '成交额 ≥ 1亿',
      pass:   amtBillion >= 1,
      detail: `今日成交额 ${amtBillion.toFixed(1)} 亿元${amtBillion >= 1 ? '，流动性充足' : '，流动性不足'}`,
    },
    {
      label:  '非 ST / *ST',
      pass:   !name.includes('ST'),
      detail: name.includes('ST') ? '⚠ 当前为 ST 类股票，存在退市风险' : '股票状态正常，无异常警示',
    },
    {
      label:  '非北交所标的',
      pass:   !code.startsWith('8') && !code.startsWith('4'),
      detail: (code.startsWith('8') || code.startsWith('4'))
        ? '⚠ 北交所标的，流动性受限，谨慎参与'
        : `${code.startsWith('6') ? '上交所' : code.startsWith('0') || code.startsWith('3') ? '深交所' : '科创板'} 标的，流动性正常`,
    },
  ];

  return { code, name, close, changePct, lists, dims, gates };
}

/**
 * Quick per-row stats for table columns (换手率 + 榜单得分).
 * Deterministic from stock code — no API needed.
 */
export function getQuickStats(code: string): { turnoverRate: number; listScore: number } {
  const r1 = seededRand(code, 11);
  const r2 = seededRand(code, 13);
  // 换手率 3–38 %, sweet zone is 10–25 %
  const turnoverRate = parseFloat((3 + r1 * 35).toFixed(1));
  // 榜单得分 45–98
  const listScore = Math.round(45 + r2 * 53);
  return { turnoverRate, listScore };
}

/**
 * Build a StockDetail from real API dimension scores.
 * Used by pages that receive actual sub-scores from the backend.
 */
export function buildRealDetail(
  code:      string,
  name:      string,
  lists:     string[],
  close:     number,
  changePct: number,
  dims:      DimScore[],
  amount_yi?: number,
): StockDetail {
  const gates: HardGate[] = [
    {
      label:  '成交额 ≥ 1亿',
      pass:   amount_yi != null ? amount_yi >= 1 : true,
      detail: amount_yi != null
        ? `今日成交额 ${amount_yi.toFixed(1)} 亿元${amount_yi >= 1 ? '，流动性充足' : '，流动性不足'}`
        : '成交额数据暂缺',
    },
    {
      label:  '非 ST / *ST',
      pass:   !name.includes('ST'),
      detail: name.includes('ST') ? '⚠ 当前为 ST 类股票，存在退市风险' : '股票状态正常，无异常警示',
    },
    {
      label:  '非北交所标的',
      pass:   !code.startsWith('8') && !code.startsWith('4'),
      detail: (code.startsWith('8') || code.startsWith('4'))
        ? '⚠ 北交所标的，流动性受限，谨慎参与'
        : `${code.startsWith('6') ? '上交所' : '深交所/科创板'} 标的，流动性正常`,
    },
  ];
  return { code, name, close, changePct, lists, dims, gates };
}

import type {
  AttributionRow,
  BacktestDetailRow,
  BacktestSummaryRow,
  FactorIcSummaryRow,
  ResearchDataStatus,
  ResearchQueryModel,
  ResearchTab,
  ResonanceRow,
} from './research';
import type { DataSourceMeta } from './dataSource';

export type ResearchDetailRouteTab = 'backtest' | 'factor-ic' | 'attribution' | 'resonance';
export type ResearchChartDataStatus = 'real' | 'fallback' | 'placeholder';

export interface ResearchDetailSummaryItem {
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'negative' | 'muted';
}

export interface ResearchDetailTableColumn {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
}

export interface ResearchDetailTableCell {
  value: string;
  tone?: 'default' | 'positive' | 'negative' | 'muted';
  subValue?: string | null;
}

export interface ResearchDetailTableRow {
  id: string;
  title: string;
  subtitle?: string | null;
  cells: Record<string, ResearchDetailTableCell>;
  stockFocus?: {
    tsCode: string;
    strategy: string;
    entryDate?: string;
  } | null;
}

export interface ResearchDetailSourceBadge {
  label: string;
  value: string;
}

export interface ChartDatum {
  label: string;
  value: number;
  secondaryValue?: number;
  note?: string;
}

export interface ResearchChartCardVm {
  title: string;
  description: string;
  status: ResearchChartDataStatus;
  emptyText?: string;
  /** 数值后缀，如 '%'；不传则不加后缀（如 T+5 分布的样本数） */
  valueSuffix?: string;
}

export interface BacktestChartVm {
  performanceSeries: ResearchChartCardVm & {
    data: ChartDatum[];
  };
  horizonBars: ResearchChartCardVm & {
    data: ChartDatum[];
  };
  returnDistribution: ResearchChartCardVm & {
    data: ChartDatum[];
  };
}

export interface FactorIcChartVm {
  icSeries: ResearchChartCardVm & {
    data: ChartDatum[];
  };
  bucketBars: ResearchChartCardVm & {
    data: ChartDatum[];
  };
  layerProfile: ResearchChartCardVm & {
    data: ChartDatum[];
  };
}

export interface AttributionChartVm {
  contributionBars: ResearchChartCardVm & {
    data: ChartDatum[];
  };
  groupCompare: ResearchChartCardVm & {
    data: ChartDatum[];
  };
  drawdownCompare: ResearchChartCardVm & {
    data: ChartDatum[];
  };
}

export interface ResonanceChartVm {
  intensityBars: ResearchChartCardVm & {
    data: ChartDatum[];
  };
  excessBars: ResearchChartCardVm & {
    data: ChartDatum[];
  };
  hitPerformance: ResearchChartCardVm & {
    data: ChartDatum[];
  };
}

export interface BaseResearchDetailVm {
  kind: ResearchDetailRouteTab;
  routeTab: ResearchDetailRouteTab;
  workspaceTab: ResearchTab;
  detailKey: string;
  query: ResearchQueryModel;
  status: ResearchDataStatus;
  title: string;
  subtitle: string;
  sourceLabel: string;
  sourceNote: string;
  dataSource?: DataSourceMeta;
  sourceBadges: ResearchDetailSourceBadge[];
  summaryCards: ResearchDetailSummaryItem[];
  infoCards: ResearchDetailSummaryItem[];
  notes: string[];
  backHref: string;
  emptyTitle: string;
  emptyText: string;
  isEmpty: boolean;
  selectedFocus: string | null;
}

export interface BacktestDetailVm extends BaseResearchDetailVm {
  kind: 'backtest';
  queryContext: {
    strategy: string;
    tradeDate: string | null;
    source: string;
    focus: string | null;
  };
  strategySummary: BacktestSummaryRow | null;
  focusSample: BacktestDetailRow | null;
  sampleColumns: ResearchDetailTableColumn[];
  sampleRows: ResearchDetailTableRow[];
  sampleNote: string;
  charts: BacktestChartVm;
}

export interface FactorIcDetailVm extends BaseResearchDetailVm {
  kind: 'factor-ic';
  queryContext: {
    factor: string;
    detailKey: string;
    tradeDate: string | null;
    source: string;
  };
  factorSummary: FactorIcSummaryRow | null;
  bucketColumns: ResearchDetailTableColumn[];
  bucketRows: ResearchDetailTableRow[];
  bucketNote: string;
  charts: FactorIcChartVm;
}

export interface AttributionDetailVm extends BaseResearchDetailVm {
  kind: 'attribution';
  queryContext: {
    group: string;
    strategy: string | null;
    riskLevel: string | null;
    tradeDate: string | null;
    source: string;
  };
  attributionSummary: AttributionRow | null;
  contributionColumns: ResearchDetailTableColumn[];
  contributionRows: ResearchDetailTableRow[];
  contributionNote: string;
  charts: AttributionChartVm;
}

export interface ResonanceDetailVm extends BaseResearchDetailVm {
  kind: 'resonance';
  queryContext: {
    resonance: string;
    comboKey: string;
    tradeDate: string | null;
    source: string;
    focus: string | null;
  };
  resonanceSummary: ResonanceRow | null;
  hitColumns: ResearchDetailTableColumn[];
  hitRows: ResearchDetailTableRow[];
  hitNote: string;
  charts: ResonanceChartVm;
}

export type ResearchDetailViewModel =
  | BacktestDetailVm
  | FactorIcDetailVm
  | AttributionDetailVm
  | ResonanceDetailVm;

export type SignalsTabKey = 'buy' | 'sell' | 'resonance' | 'flow';

export type SignalsDataOrigin = 'primary' | 'aggregate' | 'derived' | 'fallback';
export type SignalsTruthKind = 'real' | 'compatible' | 'derived' | 'fallback' | 'placeholder';
export type SignalsTruthFieldKey =
  | 'pctChg'
  | 'signalReason'
  | 'signalStrength'
  | 'strategyCount'
  | 'timeLabel'
  | 'followAction'
  | 'drawerDetail';

export type SignalsActionKind = 'execute' | 'jump' | 'placeholder';

import type { DataSourceMeta } from './dataSource';

export interface SignalsFieldTruthMeta {
  kind: SignalsTruthKind;
  label: string;
  detail: string;
}

export type SignalsFieldTruthMap = Partial<Record<SignalsTruthFieldKey, SignalsFieldTruthMeta>>;

export interface SignalsMetricVm {
  label: string;
  value: string;
  helper: string;
  origin: SignalsDataOrigin;
}

export interface SignalsFilterVm {
  label: string;
  value: string;
  origin: SignalsDataOrigin;
}

export interface SignalsSourceNoteVm {
  label: string;
  detail: string;
  origin: SignalsDataOrigin;
}

export interface SignalsContextVm {
  title: string;
  text: string;
  sections: Array<{
    label: string;
    value: string;
  }>;
  nextSteps: string[];
}

export interface SignalsBuyRowVm {
  id: string;
  tsCode: string;
  name: string;
  strategySource: string;
  signalType: string;
  signalStrength: string;
  close: number | null;
  pctChg: number | null;
  turnoverRate: number | null;
  inWatchlist: boolean;
  inPortfolio: boolean;
  crossStrategyCount: number;
  origin: SignalsDataOrigin;
  sourceLabel: string;
  truthMeta: SignalsFieldTruthMap;
}

export interface SignalsSellRowVm {
  id: string;
  portfolioId: number | null;
  tsCode: string;
  name: string;
  sourceStrategy: string;
  holdDays: number | null;
  latestClose: number | null;
  todayPnl: number | null;
  unrealizedPnl: number | null;
  actionSignal: string;
  signalReason: string;
  isFallbackReason: boolean;
  origin: SignalsDataOrigin;
  sourceLabel: string;
  truthMeta: SignalsFieldTruthMap;
}

export interface SignalsResonanceRowVm {
  id: string;
  tsCode: string;
  name: string;
  strategies: string[];
  strategyCount: number;
  latestSignal: string;
  close: number | null;
  pctChg: number | null;
  inWatchlist: boolean;
  inPortfolio: boolean;
  origin: SignalsDataOrigin;
  sourceLabel: string;
  truthMeta: SignalsFieldTruthMap;
}

export interface SignalsFlowRowVm {
  id: string;
  timeLabel: string;
  eventType: string;
  strategySource: string;
  tsCode: string;
  name: string;
  signalLabel: string;
  followAction: string;
  origin: SignalsDataOrigin;
  sourceLabel: string;
  truthMeta: SignalsFieldTruthMap;
}

export interface SignalsTabBaseVm {
  key: SignalsTabKey;
  label: string;
  title: string;
  description: string;
  dataSource?: DataSourceMeta;
  tableDataSource?: DataSourceMeta;
  metrics: SignalsMetricVm[];
  filters: SignalsFilterVm[];
  sourceNotes: SignalsSourceNoteVm[];
  context: SignalsContextVm;
  emptyTitle: string;
  emptyText: string;
}

export interface SignalsBuyTabVm extends SignalsTabBaseVm {
  key: 'buy';
  rows: SignalsBuyRowVm[];
}

export interface SignalsSellTabVm extends SignalsTabBaseVm {
  key: 'sell';
  rows: SignalsSellRowVm[];
}

export interface SignalsResonanceTabVm extends SignalsTabBaseVm {
  key: 'resonance';
  rows: SignalsResonanceRowVm[];
}

export interface SignalsFlowTabVm extends SignalsTabBaseVm {
  key: 'flow';
  rows: SignalsFlowRowVm[];
}

export interface SignalsWorkspaceVm {
  tradeDate: string;
  generatedAtText: string;
  handoffText: string;
  dataSource?: DataSourceMeta;
  workspaceNotes: SignalsSourceNoteVm[];
  warnings: string[];
  tabs: {
    buy: SignalsBuyTabVm;
    sell: SignalsSellTabVm;
    resonance: SignalsResonanceTabVm;
    flow: SignalsFlowTabVm;
  };
}

export const signalsTabOrder: SignalsTabKey[] = ['buy', 'sell', 'resonance', 'flow'];

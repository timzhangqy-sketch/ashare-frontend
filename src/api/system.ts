import api from './index';
import type {
  SystemApiHealthRawDto,
  SystemDataCoverageRawDto,
  SystemPipelineRunRawDto,
  SystemRunlogLatestRawDto,
  SystemVersionRawDto,
} from '../types/system';

function toArray<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data as T[];
    if (Array.isArray(obj.items)) return obj.items as T[];
  }
  return [];
}

export async function fetchSystemVersion(): Promise<SystemVersionRawDto | null> {
  const res = await api.get('/api/system/version');
  const payload = res.data;
  if (!payload || typeof payload !== 'object') return null;
  return payload as SystemVersionRawDto;
}

export async function fetchSystemRunlogLatest(): Promise<SystemRunlogLatestRawDto | null> {
  const res = await api.get('/api/system/runlog/latest');
  const payload = res.data;
  if (!payload || typeof payload !== 'object') return null;
  return payload as SystemRunlogLatestRawDto;
}

export async function fetchSystemPipelineRuns(tradeDate?: string): Promise<SystemPipelineRunRawDto[]> {
  const res = await api.get('/api/system/pipeline_runs', {
    params: tradeDate ? { trade_date: tradeDate } : undefined,
  });
  return toArray<SystemPipelineRunRawDto>(res.data);
}

export async function fetchSystemDataCoverage(tradeDate?: string): Promise<SystemDataCoverageRawDto[]> {
  const res = await api.get('/api/system/data_coverage', {
    params: tradeDate ? { trade_date: tradeDate } : undefined,
  });
  return toArray<SystemDataCoverageRawDto>(res.data);
}

export async function fetchSystemApiHealth(): Promise<SystemApiHealthRawDto[]> {
  const res = await api.get('/api/system/api_health');
  return toArray<SystemApiHealthRawDto>(res.data);
}

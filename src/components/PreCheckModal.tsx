import { useEffect, useState } from 'react';
import { fetchPreCheck } from '../api';
import { getStrategyDisplayName } from '../utils/displayNames';

export interface PreCheckModalProps {
  ts_code: string;
  onConfirm: (preCheckData?: Record<string, unknown>) => void;
  onCancel: () => void;
}

function getGate(obj: Record<string, unknown>): { passed: boolean; block_reasons: string[] } {
  const passed = obj.passed === true;
  const raw = obj.block_reasons;
  const block_reasons = Array.isArray(raw) ? raw.filter((r): r is string => typeof r === 'string') : [];
  return { passed, block_reasons };
}

function getScoreLevel(obj: Record<string, unknown>): 'high' | 'medium' | 'low' {
  const v = obj.score_level;
  if (v === 'high' || v === 'medium' || v === 'low') return v;
  return 'medium';
}

function formatWan(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '--';
  const wan = value / 10000;
  return `${wan.toFixed(1)}万`;
}

function formatPct(value: number | null | undefined, decimals = 2): string {
  if (value == null || Number.isNaN(value)) return '--';
  const pct = typeof value === 'number' && value <= 1 ? value * 100 : value;
  return `${Number(pct).toFixed(decimals)}%`;
}

export default function PreCheckModal({ ts_code, onConfirm, onCancel }: PreCheckModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    fetchPreCheck(ts_code)
      .then((raw) => {
        if (!cancelled) {
          setData(raw);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message ?? '加载失败');
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [ts_code]);

  const name = (data?.name as string) ?? '--';
  const code = (data?.ts_code as string) ?? ts_code;
  const strategy = (data?.strategy as string) ?? '';

  const gateObj = (data?.gate as Record<string, unknown>) ?? {};
  const gate = getGate(gateObj);

  const riskObj = (data?.risk as Record<string, unknown>) ?? {};
  const totalScore = riskObj.total_score != null ? Number(riskObj.total_score) : null;
  const scoreLevel = getScoreLevel(riskObj);

  const positionObj = (data?.position as Record<string, unknown>) ?? {};
  const suggestedShares = positionObj.suggested_shares != null ? Number(positionObj.suggested_shares) : null;
  const suggestedAmount = positionObj.suggested_amount != null ? Number(positionObj.suggested_amount) : null;
  const positionPct = positionObj.position_pct != null ? Number(positionObj.position_pct) : null;

  const impactObj = (data?.portfolio_impact as Record<string, unknown>) ?? {};
  const positionsBefore = impactObj.current_positions;
  const positionsAfter = impactObj.after_positions;
  const cashBefore = impactObj.current_cash != null ? Number(impactObj.current_cash) : null;
  const cashAfter = impactObj.after_cash != null ? Number(impactObj.after_cash) : null;
  const top1Concentration = impactObj.top1_concentration != null ? Number(impactObj.top1_concentration) : null;

  const scoreLevelLabel = scoreLevel === 'high' ? '优质' : scoreLevel === 'low' ? '偏低' : '中等';
  const scoreLevelColor = scoreLevel === 'high' ? 'var(--up)' : scoreLevel === 'low' ? 'var(--down)' : 'var(--warn)';

  return (
    <div className="pre-check-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="pre-check-modal" onClick={(e) => e.stopPropagation()}>
        {loading ? (
          <div className="pre-check-loading">加载中...</div>
        ) : error ? (
          <div className="pre-check-error">
            <div className="pre-check-title">风控预览</div>
            <p>{error}</p>
            <div className="pre-check-actions">
              <button type="button" className="btn-secondary" onClick={onCancel}>取消</button>
            </div>
          </div>
        ) : (
          <>
            <div className="pre-check-header">
              <span className="pre-check-title">{name}</span>
              <span className="pre-check-code">{code}</span>
              {strategy ? <span className="pre-check-badge">{getStrategyDisplayName(strategy) || strategy}</span> : null}
            </div>

            <div className="pre-check-divider" />

            <div className="pre-check-section">
              <div className="pre-check-grid-2">
                <div>
                  <div className="pre-check-label">Gate状态</div>
                  {gate.passed ? (
                    <div className="pre-check-value" style={{ color: 'var(--up)' }}>✓ Gate 通过</div>
                  ) : (
                    <div>
                      <div className="pre-check-value" style={{ color: 'var(--down)' }}>✗ Gate 拦截</div>
                      {gate.block_reasons.length > 0 ? (
                        <ul className="pre-check-reasons">
                          {gate.block_reasons.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  )}
                </div>
                <div>
                  <div className="pre-check-label">风险评分</div>
                  <div className="pre-check-value" style={{ fontSize: 20 }}>{totalScore ?? '--'}</div>
                  <div className="pre-check-value" style={{ color: scoreLevelColor, fontSize: 14 }}>{scoreLevelLabel}</div>
                </div>
              </div>
            </div>

            <div className="pre-check-section">
              <div className="pre-check-label">建议仓位</div>
              <div className="pre-check-grid-3">
                <div>
                  <div className="pre-check-label">建议股数</div>
                  <div className="pre-check-value">{suggestedShares != null ? `${suggestedShares}股` : '--'}</div>
                </div>
                <div>
                  <div className="pre-check-label">建议金额</div>
                  <div className="pre-check-value">{suggestedAmount != null ? formatWan(suggestedAmount) : '--'}</div>
                </div>
                <div>
                  <div className="pre-check-label">占NAV比例</div>
                  <div className="pre-check-value">{formatPct(positionPct, 1)}</div>
                </div>
              </div>
            </div>

            <div className="pre-check-section">
              <div className="pre-check-label">组合影响</div>
              <div className="pre-check-grid-2">
                <div>
                  <div className="pre-check-label">持仓变化</div>
                  <div className="pre-check-value">
                    {positionsBefore != null && positionsAfter != null
                      ? `${positionsBefore} → ${positionsAfter} 只`
                      : '--'}
                  </div>
                </div>
                <div>
                  <div className="pre-check-label">现金变化</div>
                  <div className="pre-check-value">
                    {cashBefore != null && cashAfter != null
                      ? `${formatWan(cashBefore)} → ${formatWan(cashAfter)}`
                      : '--'}
                  </div>
                </div>
              </div>
              {top1Concentration != null && !Number.isNaN(top1Concentration) ? (
                <div className="pre-check-note">最大单仓集中度 {formatPct(top1Concentration, 1)}</div>
              ) : null}
            </div>

            <div className="pre-check-divider" />

            <div className="pre-check-actions">
              <button type="button" className="btn-secondary" onClick={onCancel}>取消</button>
              <button type="button" className="btn-primary" onClick={() => onConfirm(data ?? undefined)}>确认承接</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

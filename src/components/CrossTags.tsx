import { useCrossStrategy } from '../context/useCrossStrategy';
import { getStrategyDisplayName } from '../utils/displayNames';

const STRATEGY_COLOR: Record<string, { color: string; bg: string; border: string; label: string }> = {
  VOL_SURGE: { color: 'var(--info)', bg: 'var(--info-bg)', border: 'rgba(59,130,246,.4)', label: '能量蓄势' },
  RETOC2: { color: 'var(--warn)', bg: 'var(--warn-bg)', border: 'rgba(245,158,11,.4)', label: '异动策略' },
  PATTERN_T2UP9: { color: '#A855F7', bg: 'rgba(168,85,247,.18)', border: 'rgba(168,85,247,.4)', label: '形态策略' },
  WEAK_BUY: { color: '#ef4444', bg: 'rgba(220,38,38,0.12)', border: 'rgba(220,38,38,.4)', label: '弱市吸筹' },
  PATTERN_GREEN10: { color: 'var(--down)', bg: 'var(--down-bg)', border: 'rgba(34,197,94,.4)', label: '形态策略' },
};

const FALLBACK = { color: 'var(--text-secondary)', bg: 'rgba(148,163,184,.15)', border: 'rgba(148,163,184,.3)', label: '' };

export function CrossTags({
  tsCode,
  currentStrategy,
  strategies,
}: {
  tsCode: string;
  currentStrategy: string | string[];
  strategies?: string[];
}) {
  const { crossMap } = useCrossStrategy();
  const all = strategies ?? crossMap[tsCode];
  if (!all) return null;

  const current = Array.isArray(currentStrategy) ? currentStrategy : [currentStrategy];
  const others = all.filter((strategy) => !current.includes(strategy) && strategy !== 'IGNITE');
  if (!others.length) return null;

  const multi = others.length >= 2;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 5 }}>
      {multi && (
        <span style={{ fontSize: 10, color: 'var(--warn)', fontWeight: 700, marginRight: 1 }}>+</span>
      )}
      {others.map((strategy) => {
        const cfg = STRATEGY_COLOR[strategy] ?? FALLBACK;
        const label = cfg.label || getStrategyDisplayName(strategy) || strategy;
        return (
          <span
            key={strategy}
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: '1px 5px',
              borderRadius: 4,
              background: cfg.bg,
              color: cfg.color,
              border: `1px solid ${cfg.border}`,
              lineHeight: 1.4,
            }}
          >
            {label}
          </span>
        );
      })}
    </span>
  );
}

export function MultiStrategyBadge({ tsCode }: { tsCode: string }) {
  const { crossMap } = useCrossStrategy();
  const all = crossMap[tsCode];
  const active = all?.filter((strategy) => strategy !== 'IGNITE') ?? [];
  if (active.length < 2) return null;

  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: '2px 8px',
        borderRadius: 10,
        background: 'rgba(245,158,11,.22)',
        color: 'var(--warn)',
        border: '1px solid rgba(245,158,11,.5)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
      }}
    >
      + 多策略共振
    </span>
  );
}

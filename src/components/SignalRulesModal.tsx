import { useEffect } from 'react';

interface RuleDef {
  signal: string;
  name: string;
  condition: string;
  priority: number;
}
interface Props {
  rules: { buy: RuleDef[]; warn: RuleDef[]; sell: RuleDef[] };
  onClose: () => void;
}

export default function SignalRulesModal({ rules, onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const sellGroups: { label: string; items: RuleDef[] }[] = [
    { label: '个股层面', items: rules.sell.filter(r => r.priority <= 2) },
    { label: '环境层面', items: rules.sell.filter(r => r.priority >= 3 && r.priority <= 5) },
    { label: '趋势/时间层面', items: rules.sell.filter(r => r.priority >= 6) },
  ];

  return (
    <div className="srm-overlay" onClick={onClose}>
      <div className="srm-modal" onClick={e => e.stopPropagation()}>
        <button className="srm-close" onClick={onClose}>&times;</button>
        <div className="srm-cols">
          {/* Buy */}
          <div className="srm-col">
            <h4 className="srm-col-title" style={{ color: 'var(--accent)' }}>买点信号</h4>
            {rules.buy.map(r => (
              <div key={r.signal} className="srm-rule">
                <span className="srm-priority">{r.priority}</span>
                <span className="srm-name">{r.name}</span>
                <span className="srm-cond">{r.condition}</span>
              </div>
            ))}
          </div>
          {/* Warn */}
          <div className="srm-col">
            <h4 className="srm-col-title" style={{ color: 'var(--warn)' }}>观察预警</h4>
            {rules.warn.map(r => (
              <div key={r.signal} className="srm-rule">
                <span className="srm-priority">{r.priority}</span>
                <span className="srm-name">{r.name}</span>
                <span className="srm-cond">{r.condition}</span>
              </div>
            ))}
          </div>
          {/* Sell */}
          <div className="srm-col">
            <h4 className="srm-col-title" style={{ color: 'var(--critical)' }}>卖出信号</h4>
            {sellGroups.map((g, gi) => (
              <div key={gi}>
                {gi > 0 && <div className="srm-divider" />}
                <div className="srm-group-label">{g.label}</div>
                {g.items.map(r => (
                  <div key={r.signal} className="srm-rule">
                    <span className="srm-priority">{r.priority}</span>
                    <span className="srm-name">{r.name}</span>
                    <span className="srm-cond">{r.condition}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

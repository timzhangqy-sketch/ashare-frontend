import type { ContextPanelAction } from '../../../types/contextPanel';

interface StockContextActionsProps {
  actions: ContextPanelAction[];
}

export default function StockContextActions({ actions }: StockContextActionsProps) {
  return null;
  if (!actions.length) return null;

  return (
    <section className="global-context-section">
      <div className="global-context-section-title">后续操作</div>
      {actions.length ? (
        <div className="global-context-actions">
          {actions.map(action =>
            action.onClick && !action.disabled ? (
              <button
                key={`${action.label}-action`}
                type="button"
                className="global-context-action"
                onClick={action.onClick}
              >
                <span>{action.label}</span>
                {action.note ? <small>{action.note}</small> : null}
              </button>
            ) : action.href && !action.disabled ? (
              <a key={`${action.label}-${action.href}`} className="global-context-action" href={action.href}>
                <span>{action.label}</span>
                {action.note ? <small>{action.note}</small> : null}
              </a>
            ) : (
              <div key={`${action.label}-disabled`} className="global-context-action disabled">
                <span>{action.label}</span>
                <small>{action.note ?? '当前入口尚未接入。'}</small>
              </div>
            ),
          )}
        </div>
      ) : (
        <div className="global-context-empty">当前页面尚未接入来源动作，可继续使用原有详情入口。</div>
      )}
    </section>
  );
}

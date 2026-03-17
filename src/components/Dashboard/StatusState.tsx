interface StatusStateProps {
  type: 'loading' | 'empty' | 'error';
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}

export default function StatusState({
  type,
  title,
  description,
  actionLabel,
  onAction,
  compact = false,
}: StatusStateProps) {
  return (
    <div className={`dashboard-status dashboard-status-${type}${compact ? ' compact' : ''}`}>
      <div className="dashboard-status-icon" aria-hidden="true">
        {type === 'loading' ? '...' : type === 'empty' ? '0' : '!'}
      </div>
      <div className="dashboard-status-body">
        <div className="dashboard-status-title">{title}</div>
        <div className="dashboard-status-desc">{description}</div>
      </div>
      {actionLabel && onAction ? (
        <button className="btn-secondary dashboard-status-action" onClick={onAction} type="button">
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

import type { PropsWithChildren, ReactNode } from 'react';

interface SectionCardProps extends PropsWithChildren {
  title: string;
  badge?: string;
  description?: string;
  actions?: ReactNode;
}

export default function SectionCard({
  title,
  badge,
  description,
  actions,
  children,
}: SectionCardProps) {
  return (
    <section className="card dashboard-module-card">
      <div className="card-header">
        <div>
          <span className="card-title">{title}</span>
          {description ? <p className="card-subtitle dashboard-module-desc">{description}</p> : null}
        </div>
        <div className="dashboard-module-head">
          {badge ? <span className="page-badge badge-blue">{badge}</span> : null}
          {actions}
        </div>
      </div>
      <div className="card-body dashboard-module-body">{children}</div>
    </section>
  );
}

import { Link } from 'react-router-dom';
import { getRouteMetaByKey } from '../../config/routeMeta';
import type { AppRouteKey } from '../../config/navigation';

interface DomainPlaceholderProps {
  routeKey: AppRouteKey;
  phaseNote: string;
  modules: string[];
  handoffLinks: Array<{ label: string; to: string }>;
}

export default function DomainPlaceholder({
  routeKey,
  phaseNote,
  modules,
  handoffLinks,
}: DomainPlaceholderProps) {
  const meta = getRouteMetaByKey(routeKey);

  return (
    <div className="domain-placeholder-page">
      <div className="page-header">
        <div>
          <div className="page-title">
            {meta.title}
            <span className="page-badge badge-gold">占位页</span>
          </div>
          <div className="page-desc">{meta.description}</div>
        </div>
      </div>

      <section className="card domain-placeholder-card">
        <div className="card-header">
          <span className="card-title">当前定位</span>
          <span className="c-muted" style={{ fontSize: 12 }}>Phase 4 / P0 / Round 1</span>
        </div>
        <div className="domain-placeholder-body">
          <p className="domain-placeholder-copy">{phaseNote}</p>
          <div className="domain-placeholder-columns">
            <div>
              <div className="stat-label">后续承接内容</div>
              <ul className="domain-placeholder-list">
                {modules.map(module => (
                  <li key={module}>{module}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="stat-label">临时承接入口</div>
              <div className="domain-placeholder-links">
                {handoffLinks.map(link => (
                  <Link key={link.to} className="dashboard-inline-link" to={link.to}>
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

import type { DataSourceMeta } from '../../types/dataSource';
import { getSourceStateLabel, getSourceTone, shouldShowSourceMeta } from './sourceLabels';

interface SourceBadgeProps {
  meta?: DataSourceMeta | null;
  showWhenReal?: boolean;
  className?: string;
}

export default function SourceBadge({
  meta,
  showWhenReal = false,
  className,
}: SourceBadgeProps) {
  return null;
  if (!shouldShowSourceMeta(meta, showWhenReal)) return null;
  if (!meta) return null;
  const resolvedMeta: DataSourceMeta = meta!;

  const tone = getSourceTone(resolvedMeta.data_source);
  const classes = ['source-badge', 'status-badge', 'tag-pill', `source-badge-${tone}`, className].filter(Boolean).join(' ');

  return <span className={classes}>{getSourceStateLabel(resolvedMeta.data_source)}</span>;
}

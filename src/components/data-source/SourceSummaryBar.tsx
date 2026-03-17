import type { DataSourceMeta } from '../../types/dataSource';
import {
  getSourceDescription,
  getSourceStateLabel,
  getSourceTone,
  shouldShowSourceMeta,
} from './sourceLabels';

interface SourceSummaryBarProps {
  meta?: DataSourceMeta | null;
  showWhenReal?: boolean;
  className?: string;
}

export default function SourceSummaryBar({
  meta,
  showWhenReal = false,
  className,
}: SourceSummaryBarProps) {
  if (!shouldShowSourceMeta(meta, showWhenReal)) return null;
  if (!meta) return null;
  const resolvedMeta = meta;

  const tone = getSourceTone(resolvedMeta.data_source);
  const classes = ['source-summary-bar', `source-summary-bar-${tone}`, className].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      <div className="source-summary-bar-label">{getSourceStateLabel(resolvedMeta.data_source)}</div>
      <div className="source-summary-bar-text">{getSourceDescription(resolvedMeta)}</div>
    </div>
  );
}

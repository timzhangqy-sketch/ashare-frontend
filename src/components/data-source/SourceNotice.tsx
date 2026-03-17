import type { DataSourceMeta } from '../../types/dataSource';
import {
  getSourceDescription,
  getSourceStateLabel,
  getSourceTone,
  shouldShowSourceMeta,
} from './sourceLabels';

interface SourceNoticeProps {
  meta?: DataSourceMeta | null;
  showWhenReal?: boolean;
  className?: string;
}

export default function SourceNotice({
  meta,
  showWhenReal = false,
  className,
}: SourceNoticeProps) {
  return null;
  if (!shouldShowSourceMeta(meta, showWhenReal)) return null;
  if (!meta) return null;
  const resolvedMeta = meta;

  const tone = getSourceTone(resolvedMeta.data_source);
  const classes = ['source-notice', `source-notice-${tone}`, className].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      <span className="source-notice-label">{getSourceStateLabel(resolvedMeta.data_source)}</span>
      <span className="source-notice-text">{getSourceDescription(resolvedMeta)}</span>
    </div>
  );
}

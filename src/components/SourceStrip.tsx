import type { DataSourceMeta } from '../types/dataSource';
import type { SourceTone } from './data-source/sourceLabels';
import {
  getSourceDescription,
  getSourceStateLabel,
  getSourceTone,
  shouldShowSourceMeta,
} from './data-source/sourceLabels';

const MANUAL_TONE_MAP: Record<string, SourceTone> = {
  observing: 'info',
  info: 'info',
  warning: 'warning',
  neutral: 'neutral',
};

const MANUAL_BADGE_MAP: Record<string, string> = {
  observing: '观察期',
  info: '信息',
  warning: '注意',
  neutral: '说明',
};

interface MetaDrivenProps {
  meta: DataSourceMeta | null | undefined;
  showWhenReal?: boolean;
  type?: never;
  badge?: never;
  message?: never;
  className?: string;
}

interface ManualProps {
  meta?: never;
  showWhenReal?: never;
  type: string;
  badge?: string;
  message: string;
  className?: string;
}

type SourceStripProps = MetaDrivenProps | ManualProps;

export default function SourceStrip(props: SourceStripProps) {
  const { className } = props;

  if ('type' in props && props.type) {
    const tone = MANUAL_TONE_MAP[props.type] ?? 'neutral';
    const badge = props.badge ?? MANUAL_BADGE_MAP[props.type] ?? props.type;
    const classes = ['source-strip', `source-strip--${tone}`, className].filter(Boolean).join(' ');

    return (
      <div className={classes}>
        <span className="source-strip__dot" />
        <span className="source-strip__badge">{badge}</span>
        <span className="source-strip__text">{props.message}</span>
      </div>
    );
  }

  const { meta, showWhenReal = false } = props as MetaDrivenProps;
  if (!shouldShowSourceMeta(meta, showWhenReal)) return null;
  if (!meta) return null;

  const tone = getSourceTone(meta.data_source);
  const classes = ['source-strip', `source-strip--${tone}`, className].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      <span className="source-strip__dot" />
      <span className="source-strip__badge">{getSourceStateLabel(meta.data_source)}</span>
      <span className="source-strip__text">{getSourceDescription(meta)}</span>
    </div>
  );
}

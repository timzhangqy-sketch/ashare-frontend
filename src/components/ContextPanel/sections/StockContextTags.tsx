import type { ContextPanelTag } from '../../../types/contextPanel';

interface StockContextTagsProps {
  tags: ContextPanelTag[];
}

export default function StockContextTags({ tags }: StockContextTagsProps) {
  if (!tags.length) return null;

  return (
    <section className="global-context-section">
      <div className="global-context-section-title">来源与标签</div>
      <div className="global-context-tag-list">
        {tags.map(tag => (
          <span
            key={`${tag.tone ?? 'neutral'}-${tag.label}`}
            className={`global-context-tag ${tag.tone ?? 'neutral'}`}
          >
            {tag.label}
          </span>
        ))}
      </div>
    </section>
  );
}

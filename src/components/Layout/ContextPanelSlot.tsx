import { useLocation } from 'react-router-dom';
import { useContextPanel } from '../../context/useContextPanel';
import { getRouteMeta } from '../../config/routeMeta';
import GlobalContextPanel from '../ContextPanel/GlobalContextPanel';

function buildDefaultCopy(pathname: string, title: string) {
  if (pathname.startsWith('/portfolio')) {
    return {
      kicker: '右侧上下文',
      title: '持仓中心',
      copy: '这里承接当前页面的对象摘要、相关状态和下一步动作入口，保持浏览主表时的信息连续性。',
    };
  }

  return {
    kicker: '右侧上下文',
    title,
    copy: '这里承接当前页面聚焦对象的摘要、辅助说明和相关动作，避免切换主表时丢失上下文。',
  };
}

export default function ContextPanelSlot() {
  const { pathname } = useLocation();
  const { panel } = useContextPanel();

  if (panel.isOpen) {
    return <GlobalContextPanel panel={panel} />;
  }

  // 这些工作域不展示右侧占位面板，仅保留全局 ContextPanel（选中行时由 openPanel 打开）
  if (
    pathname.startsWith('/execution')
    || pathname.startsWith('/system')
    || pathname.startsWith('/dashboard')
    || pathname.startsWith('/research')
    || pathname.startsWith('/ignition')
    || pathname.startsWith('/retoc2')
    || pathname.startsWith('/pattern')
  ) {
    return null;
  }

  const meta = getRouteMeta(pathname);
  const content = buildDefaultCopy(pathname, meta.title);

  return (
    <aside className="context-panel-slot" aria-label="右侧上下文面板">
      <div className="context-panel-card" data-testid="context-panel-empty">
        <div className="context-panel-kicker">{content.kicker}</div>
        <div className="context-panel-title">{content.title}</div>
        <p className="context-panel-copy">{content.copy}</p>
        {!pathname.startsWith('/ignition') && (
          <div className="context-panel-meta">
            <span className="context-panel-tag">当前页面</span>
            <span>{meta.path}</span>
          </div>
        )}
      </div>
    </aside>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchPipeline, type PipelineStepResp } from '../../api';
import { getRouteMeta } from '../../config/routeMeta';
import { useDashboardRuntime } from '../../context/useDashboardRuntime';
import { useDate } from '../../context/useDate';

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const STEP_NAMES: Record<string, string> = {
  daily_price: '日线行情',
  daily_basic: '基础行情',
  adj_factor: '复权因子',
  factor_merge: '因子合并',
  index_daily: '指数日线',
  intraday_5m: '5分钟数据',
  scan_snapshot: '扫描快照',
  pool_runner: '交易标的池更新',
  ignite_strict3: '能量蓄势',
  cont_upsert: '连板承接入池',
  cont_exit: '连板承接出池',
  retoc2: '异动策略',
  pattern: '形态策略',
  pool_export: '池结果导出',
  pool_mailer: '结果邮件',
  notify_push: '通知推送',
  dq_gate: '数据门禁',
  healthcheck: '健康检查',
};

type StepStatus = 'ok' | 'warn' | 'fail';

const STATUS_LABEL: Record<StepStatus, string> = {
  ok: '正常',
  warn: '关注',
  fail: '异常',
};

const REGIME_LABEL: Record<string, string> = {
  strong: '强势普涨',
  bullish: '偏强震荡',
  neutral: '震荡整理',
  bearish: '偏弱震荡',
  weak: '弱势普跌',
};

const REGIME_COLOR: Record<string, string> = {
  strong: 'var(--up)',
  bullish: 'var(--info)',
  neutral: 'var(--text-secondary)',
  bearish: 'var(--warn)',
  weak: 'var(--critical)',
};

function fmtDur(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m${seconds % 60}s`;
}

function fmtTime(value: string): string {
  const part = value.includes('T') ? value.split('T')[1] : value;
  return (part ?? value).slice(0, 5);
}

function getStatusGlow(status: StepStatus): string {
  if (status === 'ok') return '0 0 10px color-mix(in srgb, var(--color-down) 34%, transparent)';
  if (status === 'warn') return '0 0 10px color-mix(in srgb, var(--color-warning) 34%, transparent)';
  return '0 0 10px color-mix(in srgb, var(--color-up) 34%, transparent)';
}

const ChevronLeft = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const ChevronRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const CloseXIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="13" height="13">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

function StepIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="7" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  );
}

function getDisplayMeta(pathname: string, title: string, description: string) {
  if (pathname.startsWith('/research') || pathname.startsWith('/backtest')) {
    return {
      title: '研究中心',
      description: '聚合回测摘要、因子 IC、归因与共振观察。',
    };
  }

  if (pathname.startsWith('/holdings')) {
    return {
      title: '持仓中心',
      description: '兼容入口会自动承接到持仓中心，不改变正式入口语义。',
    };
  }

  if (pathname.startsWith('/system')) {
    return {
      title: '系统中心',
      description: '查看 Pipeline、数据覆盖、接口状态与运行日志。',
    };
  }

  return { title, description };
}

export default function TopBar() {
  const { pathname } = useLocation();
  const { selectedDate, setSelectedDate, prevTradingDay, nextTradingDay, isToday } = useDate();
  const { snapshot } = useDashboardRuntime();
  const routeMeta = getRouteMeta(pathname);
  const displayMeta = getDisplayMeta(pathname, routeMeta.title, routeMeta.description);

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('ashare-theme') as 'dark' | 'light') ?? 'dark';
  });
  const [showPipeline, setShowPipeline] = useState(false);
  const [pipelineState, setPipelineState] = useState<{
    key: string | null;
    steps: PipelineStepResp[];
    error: string | null;
  }>({ key: null, steps: [], error: null });
  const pipelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    localStorage.setItem('ashare-theme', theme);
  }, [theme]);

  useEffect(() => {
    const saved = localStorage.getItem('ashare-theme');
    if (saved === 'light') document.documentElement.setAttribute('data-theme', 'light');
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchPipeline(selectedDate)
      .then((data) => {
        if (cancelled) return;
        setPipelineState({
          key: selectedDate,
          steps: Array.isArray(data) ? data : [],
          error: null,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setPipelineState({
          key: selectedDate,
          steps: [],
          error: err instanceof Error ? err.message : '加载失败',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  useEffect(() => {
    if (!showPipeline) return;

    const handler = (event: MouseEvent) => {
      if (pipelineRef.current && !pipelineRef.current.contains(event.target as Node)) {
        setShowPipeline(false);
      }
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPipeline]);

  const [year, month, day] = selectedDate.split('-').map(Number);
  const currentDate = new Date(year, month - 1, day);
  const weekday = WEEKDAYS[currentDate.getDay()];
  const isWeekend = [0, 6].includes(currentDate.getDay());

  const pipeLoading = pipelineState.key !== selectedDate;
  const pipeError = pipelineState.key === selectedDate ? pipelineState.error : null;
  const safeSteps = pipeLoading ? [] : Array.isArray(pipelineState.steps) ? pipelineState.steps : [];
  const hasWarn = safeSteps.some((step) => step.status === 'warn');
  const hasFail = safeSteps.some((step) => step.status === 'fail');
  const pipelineTone = pipeLoading ? 'loading' : hasFail ? 'fail' : hasWarn ? 'warn' : 'ok';
  const dotColor =
    pipelineTone === 'loading'
      ? 'var(--text-muted)'
      : pipelineTone === 'warn'
        ? 'var(--color-warning)'
        : pipelineTone === 'fail'
          ? 'var(--color-up)'
          : 'var(--color-down)';
  const dotGlow = pipelineTone === 'loading' ? 'none' : getStatusGlow(pipelineTone as StepStatus);
  const pipelineLabel =
    pipelineTone === 'loading'
      ? '系统加载中'
      : pipelineTone === 'fail'
        ? '系统异常'
        : pipelineTone === 'warn'
          ? '系统告警'
          : '系统正常';

  const dashboardHint = useMemo(() => {
    if (pathname !== '/dashboard' || !snapshot) return '';
    const sourceLabel = snapshot.source === 'real' ? '真实数据' : '演示数据';
    return `${snapshot.tradeDate} · ${snapshot.generatedAt} · ${snapshot.systemStatusLabel} · ${sourceLabel}`;
  }, [pathname, snapshot]);

  return (
    <header className="topbar">
      <div className="topbar-title">
        {displayMeta.title}
        <span className="topbar-title-desc">{displayMeta.description}</span>
        {dashboardHint ? <span className="topbar-title-hint">{dashboardHint}</span> : null}
      </div>

      <div className="date-nav">
        <button className="date-arrow-btn" onClick={prevTradingDay} title="上一个交易日">
          <ChevronLeft />
        </button>
        <div className="date-display">
          <input
            type="date"
            className="date-input"
            value={selectedDate}
            onChange={(event) => event.target.value && setSelectedDate(event.target.value)}
          />
          <span className={`date-weekday${isWeekend ? ' is-weekend' : ''}`}>
            {weekday}
            {isWeekend ? <span className="date-weekend-pill">休市</span> : null}
          </span>
          {snapshot?.marketRegime ? (
            <span
              className="regime-tag"
              style={{ color: REGIME_COLOR[snapshot.marketRegime] ?? 'var(--text-secondary)' }}
            >
              {REGIME_LABEL[snapshot.marketRegime] ?? snapshot.marketRegime}
            </span>
          ) : null}
        </div>
        <button className="date-arrow-btn" onClick={nextTradingDay} disabled={isToday} title="下一个交易日">
          <ChevronRight />
        </button>
        {!isToday ? (
          <button
            className="date-today-btn"
            onClick={() => {
              const today = new Date();
              const next = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
              setSelectedDate(next);
            }}
          >
            今天
          </button>
        ) : null}
      </div>

      <div className="topbar-sep" />

      <button
        className="theme-btn"
        onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
        aria-label={theme === 'dark' ? '切换为浅色主题' : '切换为深色主题'}
        title={theme === 'dark' ? '切换为浅色主题' : '切换为深色主题'}
      >
        切换主题
      </button>

      <div ref={pipelineRef}>
        <button className={`pipeline-btn${showPipeline ? ' is-active' : ''}`} onClick={() => setShowPipeline((current) => !current)}>
          <span className="pipeline-btn-dot" style={{ background: dotColor, boxShadow: dotGlow }} />
          {pipelineLabel}
        </button>

        {showPipeline ? (
          <div className="pipeline-popup">
            <div className="pipeline-popup-header">
              <div>
                <div className="pipeline-popup-title">
                  <span className="pipeline-popup-dot" style={{ background: dotColor, boxShadow: dotGlow }} />
                  系统状态
                </div>
                <div className="pipeline-popup-meta">
                  {selectedDate} · {safeSteps.length > 0 ? `${safeSteps.filter((step) => step.status === 'ok').length}/${safeSteps.length} 步正常` : pipeError ? '加载失败' : '等待返回'}
                </div>
              </div>
              <button className="pipeline-close-btn" onClick={() => setShowPipeline(false)} aria-label="关闭系统状态面板">
                <CloseXIcon />
              </button>
            </div>

            <div className="pipeline-popup-body">
              {pipeLoading ? (
                <div className="pipeline-loading">
                  <div className="spinner" />
                  正在加载系统状态...
                </div>
              ) : null}

              {!pipeLoading && pipeError ? (
                <div className="pipeline-error">
                  <span className="pipeline-error-label">加载失败：</span>
                  {pipeError}
                </div>
              ) : null}

              {!pipeLoading && !pipeError
                ? safeSteps.map((step, index) => (
                    <div key={`${step.step}-${index}`} className="pipeline-step">
                      <div className={`pipeline-step-icon status-${step.status}`}>
                        <StepIcon />
                      </div>
                      <div className="pipeline-step-main">
                        <div className="pipeline-step-row">
                          <div className="pipeline-step-labels">
                            <span className="pipeline-step-name">{STEP_NAMES[step.step] ?? step.step}</span>
                            <span className="pipeline-step-code">{step.step}</span>
                          </div>
                          <div className="pipeline-step-meta">
                            <span className="pipeline-step-time">{fmtTime(step.started_at)}</span>
                            <span className="pipeline-step-duration">{fmtDur(step.duration_ms)}</span>
                            <span className={`pipeline-step-status status-${step.status}`}>{STATUS_LABEL[step.status as StepStatus]}</span>
                          </div>
                        </div>
                        <div className="pipeline-step-message">{step.message}</div>
                      </div>
                    </div>
                  ))
                : null}
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}

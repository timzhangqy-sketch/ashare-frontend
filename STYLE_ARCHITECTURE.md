# 前端样式架构说明

## 一、全局CSS文件清单

| 路径 | 说明 |
|------|------|
| `src/index.css` | 唯一全局样式入口：变量、Reset、布局、组件、各页/模块样式，约 7800+ 行 |
| `src/App.css` | 应用级覆盖，内容极少（仅注释 "App-level overrides — intentionally minimal"） |

**说明**：项目中无 `.scss` 文件，全部为原生 CSS。样式集中写在 `index.css`，按区块注释划分（Layout、Sidebar、TopBar、Card、Table、Drawer、各 page 等）。

---

## 二、全局公共类（index.css）

以下按功能区域列出**主要类名**及其关键属性（display、flex 方向、对齐、padding、font-size 等）。多选择器共用的规则在「设计令牌区块」中统一覆盖（见后）。

### 2.1 根与 Reset

- `*` — box-sizing: border-box, margin: 0, padding: 0
- `body` — font-family: var(--font-sans), font-size: 14px, line-height: 1.5, background: var(--bg-base), color: var(--text-primary)

### 2.2 布局

- `.layout` — display: flex, height: 100vh, overflow: hidden
- `.main-area` — flex: 1, display: flex, flex-direction: column, overflow: hidden, min-width: 0
- `.workspace-shell` — flex: 1, display: flex, min-height: 0
- `.content` — flex: 1, overflow-y: auto, padding: 24px

### 2.3 侧栏 (Sidebar)

- `.sidebar` — width: var(--sidebar-width), height: 100vh, display: flex, flex-direction: column, flex-shrink: 0
- `.sidebar-logo` — height: var(--topbar-height), display: flex, align-items: center, gap: 10px, padding: 0 16px
- `.sidebar-logo-mark` — display: flex, align-items: center, justify-content: center, font-size: 13px
- `.sidebar-logo-text` — font-size: 14px, font-weight: 700
- `.sidebar-logo-sub` — font-size: 10px
- `.sidebar-nav` — flex: 1, padding: 10px 0, overflow-y: auto
- `.nav-section-label` — font-size: 10px, padding: 10px 20px 4px, text-transform: uppercase
- `.nav-item` — display: flex, align-items: center, gap: 10px, padding: 12px 12px
- `.nav-icon` — display: flex, align-items: center, justify-content: center
- `.nav-label-wrap` — display: flex, flex-direction: column, gap: 6px
- `.nav-label` — font-size: 15px, font-weight: 500
- `.nav-badge` — font-size: 12px
- `.sidebar-footer` — padding: 12px 16px, font-size: 11px, display: flex, align-items: center, justify-content: space-between
- `.status-dot` — width: 6px, height: 6px, border-radius: 50%, display: inline-block

### 2.4 顶栏 (TopBar)

- `.topbar` — height: var(--topbar-height), display: flex, align-items: center, padding: 0 24px, gap: 12px
- `.topbar-title` — font-size: 14px, font-weight: 600, flex: 1
- `.topbar-sep` — width: 1px, height: 18px
- `.date-nav` — display: flex, align-items: center, gap: 4px
- `.date-arrow-btn` — display: flex, align-items: center, justify-content: center, width: 26px, height: 26px
- `.date-display` — padding: 3px 10px, display: flex, align-items: center, gap: 8px
- `.date-input` — font-size: 13px, font-weight: 500
- `.date-weekday` — font-size: 12px
- `.regime-tag-*` (positive/mild/warning/danger/unknown) — font-size: 11px, padding: 2px 8px
- `.date-today-btn` — font-size: 12px, padding: 0 9px, height: 26px
- `.theme-btn` — display: flex, align-items: center, justify-content: center, width: 28px, height: 26px, font-size: 14px

### 2.5 上下文面板

- `.context-panel-slot` — width: 280px, padding: 16px, overflow-y: auto
- `.context-panel-card` — padding: 16px, border-radius: 10px
- `.context-panel-kicker` — font-size: 10px
- `.context-panel-title` — font-size: 14px, font-weight: 700
- `.context-panel-copy` — font-size: 12px
- `.context-panel-meta` — display: flex, align-items: center, gap: 8px, font-size: 11px
- `.global-context-panel` — display: flex, flex-direction: column, gap: 12px
- `.global-context-stock-header` — display: flex, flex-direction: column, gap: 8px
- `.global-context-stock-title-row` — display: flex, align-items: flex-start, justify-content: space-between
- `.global-context-stock-name` — font-size: 17px, font-weight: 700
- `.global-context-stock-code` — font-size: 12px
- `.global-context-section` — display: flex, flex-direction: column, gap: 10px, padding-top: 12px
- `.global-context-section-title` — font-size: 11px, font-weight: 700
- `.global-context-stat-card` — display: flex, flex-direction: column, gap: 4px, padding: 10px 11px
- `.global-context-stat-card span` — font-size: 11px
- `.global-context-stat-card strong` — font-size: 13px
- `.global-context-actions` — display: flex, flex-direction: column, gap: 8px
- `.global-context-action` — display: flex, flex-direction: column, gap: 4px, padding: 10px 12px, text-align: left

### 2.6 页面结构

- `.page-header` — margin-bottom: 20px, display: flex, align-items: flex-start, justify-content: space-between, gap: 12px
- `.page-title` — font-size: 17px, font-weight: 700, display: flex, align-items: center, gap: 8px
- `.page-badge` — font-size: 11px, padding: 2px 8px, border-radius: 10px
- `.page-desc` — font-size: 13px, color: var(--text-muted), margin-top: 3px
- `.badge-red / .badge-green / .badge-gold / .badge-blue` — background/color/border 语义色

### 2.7 统计卡片与网格

- `.stat-grid` — display: grid, grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)), gap: 12px, margin-bottom: 20px
- `.stat-card` — display: flex, flex-direction: column, justify-content: flex-start, padding: 12px 16px, padding-top: 16px, border-radius: 8px
- `.stat-label` — font-size: 11px, margin-bottom: 6px, text-transform: uppercase, letter-spacing: 0.04em
- `.stat-value` — font-size: 24px, font-weight: 700, font-variant-numeric: tabular-nums, line-height: 1
- `.stat-sub` — font-size: 11px, margin-top: 4px

### 2.8 卡片

- `.card` — background: var(--bg-card), border: 1px solid var(--border-default), border-radius: 8px, overflow: hidden
- `.card-header` — display: flex, align-items: center, justify-content: space-between, padding: 12px 16px
- `.card-title` — font-size: 13px, font-weight: 600
- `.card-body` — padding: 16px

### 2.9 表格

- `.data-table` — width: 100%, border-collapse: collapse, font-size: 13px
- `.data-table th` — text-align: left, padding: 8px 14px, font-size: 11px, font-weight: 600
- `.data-table td` — padding: 10px 14px
- `.rank-badge` — display: inline-flex, align-items: center, justify-content: center, font-size: 11px, width: 22px, height: 22px

### 2.10 工具色

- `.c-red / .c-green / .c-gold / .c-blue / .c-cyan / .c-muted / .c-sec / .c-up / .c-down` — 仅 color 语义

### 2.11 抽屉 (Drawer)

- `.drawer-overlay` — position: fixed, z-index: 200
- `.drawer` — position: fixed, right: 0, width: min(max(680px, 55vw), …), transform/transition
- `.drawer-header` — display: flex, justify-content: space-between, align-items: flex-start, padding: 20px
- `.drawer-close-btn` — display: flex, align-items: center, justify-content: center, width: 28px, height: 28px
- `.drawer-section` — padding: 12px 20px
- `.drawer-section-title` — font-size: 10px, font-weight: 700
- `.drawer-card` — padding: 12px 14px, border-radius: 8px
- `.drawer-flat-row` — display: flex, justify-content: space-between, align-items: center, padding: 6px 0
- `.drawer-flat-label` — font-size: 12px
- `.drawer-flat-value` — font-size: 13px, font-weight: 600
- `.drawer-body` — display: flex, flex-direction: column, min-height: 100%
- `.drawer-scroll` — flex: 1, overflow-y: auto, padding: 16px, display: flex, flex-direction: column, gap: 12px
- `.drawer-stock-title` — font-size: 20px
- `.drawer-quote-price` — font-size: 22px
- `.drawer-quote-change` — font-size: 13px
- `.drawer-chart-state` — justify-content: center
- `.drawer-info-label` — font-size: 11px
- `.drawer-info-value` — font-size: 13px
- `.drawer-ai-title` — font-size: 11px
- `.drawer-ai-item` — display: flex, gap: 6px, font-size: 12px

### 2.12 Pipeline 弹层

- `.pipeline-btn` — display: flex, align-items: center, padding: 0 10px, font-size: 12px
- `.pipeline-popup` — display: flex, flex-direction: column
- `.pipeline-popup-header` — padding: 12px 16px, display: flex, align-items: flex-start, justify-content: space-between
- `.pipeline-step` — display: flex, align-items: flex-start, gap: 10px, padding: 8px 16px
- `.page-footer` — display: flex, align-items: center, justify-content: center, font-size: 11px, padding: …

### 2.13 加载 / 错误 / 空状态

- `.page-loading` — display: flex, align-items: center, justify-content: center, gap: 10px, padding: 80px 0, font-size: 13px
- `.page-error` — display: flex, flex-direction: column, align-items: center, justify-content: center, gap: 10px, padding: 60px 0
- `.page-error-msg` — font-size: 13px
- `.page-error-detail` — font-size: 12px
- `.spinner` — 旋转动画
- `.empty-state` — display: flex, flex-direction: column, align-items: center, justify-content: center, padding: 60px 20px
- `.empty-icon` — font-size: 28px
- `.empty-text` — font-size: 13px

### 2.14 页签

- `.page-tabs` — display: flex, gap: 0, margin-bottom: 20px
- `.page-tab-btn` — padding: 8px 22px, font-size: 14px
- `.page-tab-btn.active` — border-bottom: 2px solid, color 高亮

### 2.15 弹窗与表单

- `.modal-overlay` — display: flex, align-items: center, justify-content: center
- `.modal-header` — padding: 16px 20px, display: flex, align-items: center, justify-content: space-between
- `.modal-title` — font-size: 14px, font-weight: 600
- `.modal-body` — padding: 20px
- `.modal-footer` — padding: 12px 20px, display: flex, justify-content: flex-end
- `.form-label` — display: block, font-size: 12px
- `.form-input` — padding: 7px 11px, font-size: 13px
- `.btn-primary` — padding: 7px 18px, font-size: 13px, font-weight: 600
- `.btn-secondary` — padding: 7px 18px, font-size: 13px
- `.retry-btn` — padding: 4px 14px, font-size: 12px

### 2.16 设计令牌区块（后半文件，约 6390+ 行）

存在第二套 `:root` 设计令牌（--font-body: 13px, --font-label: 12px, --font-small: 11px, --font-caption: 10px, --font-title: 16px, --font-h1/h2/h3, --font-kpi: clamp(24px, 1.85vw, 30px)，以及 --radius-*, --shadow-*）。下列选择器在该区块及后续被统一覆盖：

- `.stat-card`, `.execution-metric-card`, `.system-metric-card`, `.research-summary-card`, `.signals-summary-card`, `.portfolio-summary-card` — 统一 background、border-radius: var(--radius-lg)、box-shadow
- `.stat-label`, `.system-metric-card span`, `.execution-metric-card span`, `.context-panel-kicker`, `.global-context-section-title`, `.nav-section-label` — color: #F5A623, font-size: var(--font-caption), font-weight: 700, text-transform: uppercase
- `.stat-value`, `.system-metric-card strong`, `.execution-metric-card strong`, `.research-kpi-value`, … — color: var(--text-primary), font-size: var(--font-kpi), font-weight: 760
- `.data-table th/td` — font-size: var(--font-caption) / var(--font-body), padding: 12px 16px
- `.table-shell`, `.signals-table-shell`, `.watchlist-table-shell`, `.portfolio-table-shell`, … — overflow: hidden, border-radius: var(--radius-lg), box-shadow: var(--shadow-sm)

### 2.17 持仓 (Portfolio) 相关

- `.portfolio-summary-strip` — display: grid, grid-template-columns: repeat(4, minmax(0, 1fr)), gap: 12px, padding: 16px
- `.portfolio-summary-grid-12` — grid-template-rows: auto auto auto
- `.portfolio-summary-card` — min-height: 98px, text-align: left, align-items: flex-start, justify-content: flex-start
- `.portfolio-summary-card .stat-label/.stat-value/.stat-sub` — text-align: left
- `.portfolio-summary-value` — font-size: 16px, font-weight: 600；tone 修饰：portfolio-summary-tone-up/down/warn/muted
- `.concentration-section` — display: flex, gap: 16px, padding: 16px
- `.concentration-row` — display: flex, align-items: center, gap: 8px
- `.portfolio-layout` — display: grid, grid-template-columns: minmax(0, 1fr) 300px, gap: 16px, align-items: start
- `.portfolio-main` — display: flex, flex-direction: column, gap: 16px
- `.portfolio-feedback` — display: flex, align-items: center, justify-content: space-between, padding: 12px 16px

其余页面/模块（Dashboard、Signals、Watchlist、Execution、Research、System、PreCheck、Risk 等）在 `index.css` 中均有对应前缀类（如 `.dashboard-*`, `.signals-*`, `.watchlist-*` 等），数量众多，此处不逐条列出；命名规律为「页面名-区域-元素」。

---

## 三、各页面私有样式

### Portfolio.tsx

- **使用的全局类**：portfolio-page, portfolio-hero, card, page-title, page-desc, portfolio-hero-side, portfolio-kicker, portfolio-date, portfolio-sub, portfolio-feedback*, card-header, card-title, card-subtitle, card-body, portfolio-summary-strip, portfolio-summary-grid-12, **stat-card**, **portfolio-summary-card**, stat-label, stat-value, portfolio-summary-value, portfolio-summary-tone-*, stat-sub, concentration-*, page-tabs, portfolio-tabs, page-tab-btn, portfolio-layout, portfolio-main, portfolio-loading-state, portfolio-table-shell, table-shell, data-table, portfolio-table-row, portfolio-table-empty-row, portfolio-empty-state, table-empty, portfolio-context, portfolio-context-card, portfolio-context-body, portfolio-context-empty, page-error, retry-btn, center, right, numeric 等
- **内联 style 覆盖**：
  - 概览卡片容器：`textAlign: 'left', alignItems: 'flex-start', justifyContent: 'flex-start'`（覆盖继承的垂直居中）
  - 概览数值：`fontSize: '16px'`（覆盖 .stat-value 的 24px）
  - 集中度条：`width: ${widthPct}%`, `background: getStrategyBarColor(key)` / getIndustryBarColor(...)
- **私有 className**：portfolio-summary-card, portfolio-summary-value, portfolio-summary-tone-*, concentration-*, portfolio-col-hold-days, portfolio-cell-title, portfolio-inline-meta, portfolio-signal-badge, portfolio-empty-title, portfolio-empty-text, portfolio-transactions-intro, portfolio-context-empty 等（样式定义在 index.css 的 portfolio 区块）

### System/index.tsx

- **使用的全局类**：domain-page, system-page, system-hero, system-hero-copy, page-kicker, page-banner, system-metrics, **stat-card**, system-metric-card, page-tabs, system-tabs, page-tab-btn, system-tab-label, system-tab-desc, system-workspace, system-main, card, card-header, section-header, system-section-header, source-section-head, card-body, empty-state, system-list-container, system-list, system-row, system-row-body, system-row-top, system-row-copy, system-row-meta, system-row-meta-item, system-row-summary, system-context, system-context-card, risk-context-body, system-context-header, system-context-kicker, system-context-section, system-context-grid, system-context-stat, system-next-steps, system-next-step, system-context-empty-*
- **内联 style**：无
- **私有 className**：全部为 system-*，在 index.css 中有对应定义

### PatternScreen.tsx

- **使用的全局类**：stat-grid, stat-card, stat-label, stat-value, stat-sub, c-red, c-blue, c-cyan, c-gold
- **内联 style**：无
- **私有 className**：无（纯全局类）

### Signals.tsx

- **使用的全局类**：signals-page, card, signals-hero, signals-hero-copy, page-title, page-desc, signals-hero-note, signals-warning-list, signals-warning-item, signals-hero-side, signals-hero-kicker, signals-hero-date, signals-hero-sub, signals-feedback-banner, page-tabs, signals-tabs, page-tab-btn, signals-layout, signals-main, card-header, source-card-head, card-title, card-subtitle, card-body, signals-loading-state, spinner, page-error, retry-btn, signals-summary-grid, **stat-card**, signals-summary-card, stat-label, stat-value, signals-summary-value, stat-sub, signals-summary-note, signals-compact-card, signals-compact-body, signals-filter-shell, signals-table-row, signals-cell-title, signals-inline-meta, signals-status-stack, signals-mini-pill, signals-origin-badge, signals-action-btn, signals-action-kind, signals-row-actions, numeric, center, right 等
- **内联 style 覆盖**：card-body 一处 `paddingTop: 12, paddingBottom: 0`；部分单元格 `style={{ color: pnlColor(...) }}` 或 `style={{ color: pnlColor(...) }}` 用于涨跌色
- **私有 className**：signals-* 系列（在 index.css 中有完整 signals 区块）

### Dashboard.tsx

- **使用的全局类**：dashboard-page, dashboard-hero, card, dashboard-hero-copy, page-title, page-desc, dashboard-hero-note, dashboard-hero-actions, btn-primary, btn-secondary, dashboard-link-btn, dashboard-source-summary, card-body, dashboard-module-body, action-list-section, action-list-header, action-list-title, action-list-body, action-list-row, action-list-label, action-list-dot--sell/buy/watch, action-list-badge--*, action-list-content, action-list-card--*, action-list-card-name, action-list-card-code, action-list-card-sep, action-list-card-meta, action-list-card-pct, action-list-more, action-list-empty, action-list-footer, action-list-footer-link, dashboard-kpi-grid, dashboard-kpi-skeleton, dashboard-section-grid
- **内联 style 覆盖**：`minHeight: 420`（action-list-section）；`color: (item.gain_pct >= 0 ? 'var(--up)' : 'var(--down)')`（action-list-card-pct）
- **私有 className**：dashboard-*, action-list-*（样式在 index.css）

### Watchlist.tsx

- **使用的全局类**：watchlist-page, watchlist-hero, card, watchlist-hero-copy, page-title, page-desc, watchlist-hero-note, watchlist-hero-side, watchlist-hero-kicker, watchlist-hero-date, watchlist-hero-sub, watchlist-feedback-banner, card-body, watchlist-metric-strip, watchlist-metric-strip-5, **stat-card**, watchlist-metric-card, stat-label, stat-value, watchlist-metric-value, stat-sub, page-tabs, page-tab-btn, watchlist-controls, watchlist-control, watchlist-list-container, watchlist-loading-state, watchlist-view-placeholder, watchlist-table-shell, table-shell, data-table, watchlist-table-empty-row, watchlist-empty-state, table-empty, watchlist-table-row, watchlist-cell-title, watchlist-inline-meta, numeric, right, center 等
- **内联 style 覆盖**：部分单元格 `style={{ color: pnlColor(row.latestPctChg) }}`、`style={{ color: pnlColor(row.gainSinceEntry, true) }}` 等
- **私有 className**：watchlist-* 系列（在 index.css 有完整 watchlist 区块）

### 其他页面（简要）

- **Execution/index.tsx**：execution-*、stat-card、execution-metric-card、page-tabs、card、data-table、execution-table-row 等
- **Research/index.tsx**：research-*、stat-card、research-summary-card、card、data-table 等
- **Risk/index.tsx**：risk-*、card、risk-hero 等
- **Retoc2Alert / IgnitionList / BacktestPage / Holdings**：使用 card、stat-grid、stat-card、data-table、page-* 等通用类
- **placeholders/***：占位页，使用 domain-page、system-page、signals-page、watchlist-page 等容器类

### 组件（摘要）

- **Layout (TopBar, Sidebar, ContextPanelSlot, Layout)**：topbar, date-nav, date-arrow-btn, date-display, date-input, date-weekday, regime-tag, date-today-btn, theme-btn, pipeline-btn, pipeline-popup*, sidebar, sidebar-logo, nav-item, nav-icon, nav-label-wrap, nav-label, nav-badge, context-panel-slot, context-panel-card, context-panel-kicker, context-panel-title, context-panel-copy, context-panel-meta；TopBar 内联 style：regime 颜色、pipeline dot 的 background/boxShadow
- **PreCheckModal**：pre-check-overlay, pre-check-modal, pre-check-title, pre-check-actions, pre-check-header, pre-check-code, pre-check-badge, pre-check-grid-2/3, pre-check-label, pre-check-value, pre-check-reasons, pre-check-note, btn-primary, btn-secondary；内联：color: 'var(--up)'/'var(--down)'、fontSize: 20/14
- **WatchlistTab**：stat-grid, stat-card, stat-label, stat-value, stat-sub, card, card-header, card-title, table-shell, data-table, page-loading, page-error, empty-state, c-muted, numeric；内联：`style={{ color, fontWeight: 600 }}`、`style={{ fontSize: 14, color: 'var(--text-muted)', paddingTop: 4 }}`
- **Drawer/KlineChart**：drawer-section-block, drawer-section-head, drawer-section-title, drawer-section-meta, drawer-period-switch, drawer-card, drawer-chart-card, drawer-chart-state, drawer-chart-canvas；内联：visibility: loading/error ? 'hidden' : 'visible'
- **ContextPanel (GlobalContextPanel, StockContext*)**：global-context-section, global-context-section-title, global-context-stat-grid, global-context-stat-card, global-context-empty, global-context-inline-note 等
- **Dashboard 子组件 (OpportunitySection, TodaySummarySection, PortfolioSection, SystemHealthSection, SectionCard, KpiCard, MetricStrip, StatusState, RiskSection 等)**：dashboard-section-layout, dashboard-list-card, dashboard-list-title, dashboard-list-items, dashboard-list-item, dashboard-item-title, dashboard-item-side, page-badge 等
- **Risk 组件**：risk-hero, risk-kicker, risk-context-body 等
- **data-source (SourceBadge, SourceSummaryBar, SourceNotice)**：使用全局或页面内 source-* 类

---

## 四、字体大小控制体系

### 4.1 层级来源

1. **body**：`font-size: 14px`（整站基准）
2. **第一套变量（:root 前约 80 行）**：仅定义 `--font-sans`、`--font-mono`，无字号变量
3. **第二套设计令牌（约 6415–6423 行）**：
   - `--font-body: 13px`
   - `--font-label: 12px`
   - `--font-small: 11px`
   - `--font-caption: 10px`
   - `--font-title: 16px`
   - `--font-h1: clamp(22px, 2vw, 27px)`
   - `--font-h2: 16px`
   - `--font-h3: 14px`
   - `--font-kpi: clamp(24px, 1.85vw, 30px)`

### 4.2 使用这些变量的类（设计令牌区块内）

- **--font-caption**：.stat-label, .system-metric-card span, .execution-metric-card span, .context-panel-kicker, .global-context-section-title, .nav-section-label, .data-table th 等
- **--font-kpi**：.stat-value, .system-metric-card strong, .execution-metric-card strong, .research-kpi-value, .system-hero h1 等
- **--font-body**：.data-table td, .table-empty, 多处列表/表格正文
- **--font-label**：部分表单、标签、按钮说明
- **--font-title**：部分区块标题（约 6630 行附近）

### 4.3 硬编码字号（前部 index.css）

- 10px：context-panel-kicker, drawer-section-title, nav-section-label
- 11px：stat-label, stat-sub, sidebar-footer, context-panel-meta, global-context-section-title, global-context-stat-card span, drawer-info-label, drawer-ai-title, rank-badge, data-table th
- 12px：context-panel-copy, nav-badge, date-weekday, drawer-flat-label, drawer-inline-note, drawer-ai-item, form-label, pipeline-btn
- 13px：date-input, drawer-flat-value, drawer-quote-change, drawer-info-value, data-table, modal-title, form-input, btn-primary/btn-secondary, empty-text, page-error-msg
- 14px：topbar-title, context-panel-title, theme-btn, body 继承
- 15px：nav-label
- 16px：portfolio-summary-value（覆盖 stat-value）
- 17px：page-title, global-context-stock-name
- 20px：drawer-stock-title
- 22px：drawer-quote-price
- 24px：stat-value（被 design token 区块改为 var(--font-kpi)）

### 4.4 内联 style 覆盖

- **Portfolio 概览数值**：`fontSize: '16px'` → 覆盖 .stat-value 的 24px / var(--font-kpi)
- **WatchlistTab 数据来源**：`fontSize: 14, color: 'var(--text-muted)', paddingTop: 4`
- **PreCheckModal**：`fontSize: 20`（风险评分）、`fontSize: 14`（等级说明）

### 4.5 优先级关系

- **内联 style** > **类 + 设计令牌变量** > **类硬编码** > **body 14px**
- 设计令牌区块在后，会覆盖前部同选择器的 font-size（如 .stat-value 先 24px 后 var(--font-kpi)）
- 页面/组件内联 fontSize 明确覆盖该节点，不受全局 .stat-value 或 .portfolio-summary-value 影响

---

## 五、Flex 对齐控制体系

### 5.1 使用 align-items / justify-content 的全局类（节选）

- **align-items: center**：.sidebar-logo, .nav-item, .nav-icon, .topbar, .date-nav, .date-arrow-btn, .date-display, .theme-btn, .context-panel-meta, .global-context-tag, .sidebar-footer, .card-header, .drawer-close-btn, .drawer-flat-row, .drawer-ai-action-row, .drawer-confidence-head, .rank-badge, .modal-header, .page-loading, .empty-state, .modal-overlay, .pipeline-btn, .pipeline-step-icon
- **align-items: flex-start**：.global-context-stock-title-row, .page-header, .drawer-header（与 justify-content: space-between）, .pipeline-popup-header, .pipeline-step, .drawer-header-actions
- **justify-content: center**：.sidebar-logo-mark, .nav-icon, .date-arrow-btn, .theme-btn, .drawer-close-btn, .rank-badge, .page-loading, .page-footer, .modal-overlay, .drawer-chart-state, .pipeline-step-icon
- **justify-content: space-between**：.sidebar-footer, .card-header, .drawer-header, .drawer-flat-row, .page-header, .modal-header, .portfolio-feedback
- **justify-content: flex-start**：.stat-card, .portfolio-summary-card
- **justify-content: flex-end**：.modal-footer

### 5.2 内联 style 覆盖

- **Portfolio 概览卡片容器**：`alignItems: 'flex-start', justifyContent: 'flex-start'`，确保在 .stat-card 与 .portfolio-summary-card 下内容从左上对齐，覆盖任何父级或全局的居中。

### 5.3 优先级关系

- **内联 style** 覆盖同元素上的类设置
- 同一元素多类时，**后定义的类**覆盖先定义的（index.css 中 .portfolio-summary-card 在 .stat-card 之后，且都设了 align-items/justify-content）
- 子元素不继承 align-items/justify-content，但会受父 flex 的 align-items 影响；Portfolio 在卡片 div 上显式写内联，避免被 .stat-card 或其它父级 flex 居中

---

## 六、已知冲突与问题

1. **两套设计令牌**：`:root` 在文件前部主要定义颜色、间距、阴影等；约 6390 行起有第二套 `:root`（含 --font-*, --radius-*, --shadow-* 等）。后者作用于「设计令牌区块」及之后的选择器，与前部硬编码（如 .stat-value 24px）存在覆盖关系，阅读时需前后对照。
2. **.stat-value 与 .portfolio-summary-value 字号**：.stat-value 为 24px（前部）且在后部被改为 var(--font-kpi)；.portfolio-summary-value 为 16px。Portfolio 概览卡片又用内联 `fontSize: '16px'` 再盖一层，三者需统一意图（目前是刻意将概览数值缩小为 16px）。
3. **.stat-label 颜色**：前部为 var(--text-secondary)，设计令牌区块中与 .nav-section-label 等统一为 #F5A623，若 light 主题或其它页面期望灰色标签，可能被覆盖。
4. **Flex 与 Grid 混用**：.portfolio-summary-strip 为 grid，子项 .stat-card.portfolio-summary-card 为 flex 容器；对齐由子项自身 flex + 内联控制，无冲突，但需注意 min-height: 98px 与 padding-top: 16px 在 .stat-card 上的叠加。
5. **表格类名重复**：.data-table 在前部与设计令牌区块都有定义（padding、font-size、border 等），后部覆盖前部，若只改前部可能无效。
6. **无 CSS Modules / 作用域**：全部为全局类，命名依赖前缀（如 portfolio-*, signals-*）避免冲突；新增页面或组件建议继续使用单一路径前缀。

---

*文档由对 `src/index.css`、`src/pages/**/*.tsx`、`src/components/**/*.tsx` 的扫描生成，覆盖至 2025-03 的代码状态。*

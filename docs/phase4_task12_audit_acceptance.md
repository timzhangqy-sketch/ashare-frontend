# Phase 4 - 子任务12 验收清单基础稿

## 1. 任务目标

子任务12的目标是为前端关键工作区建立可维护的数据来源状态体系，并在不重做主体布局、不改后端接口的前提下，完成真实链路止血、来源状态建模、最小显性标识接入与审计收口。

本任务重点覆盖：

- Dashboard 真实链路空值止血
- 统一 `DataSourceMeta` 协议
- `real / real_empty / real_observing / fallback / mock / mixed / degraded / placeholder` 八类状态建模
- Dashboard / Research / Execution / System / Risk / ContextPanel 的最小显性标识接入
- 空表、观察期、兼容结果、降级结果、占位内容的边界区分

## 2. 本轮范围与边界

本任务范围控制在以下页面与适配层：

- Dashboard
- Research
- Execution
- System
- Risk
- ContextPanel

明确不在本任务范围内的内容：

- 不重做 AppShell
- 不重排主体页面布局
- 不做后端接口开发
- 不扩散到 Signals / Watchlist / Portfolio 主体页面
- 不做全站视觉重做
- 不做全站中文化专项

## 3. 已建立的状态枚举及含义

- `real`：区块直接使用真实接口结果
- `real_empty`：真实接口已接通，但当前查询为空表
- `real_observing`：真实接口已接通，但样本量仍偏少，当前按观察期展示
- `degraded`：真实链路已接通，但局部字段缺失或类型不稳，当前按安全策略降级展示
- `fallback`：真实链路当前不可直接承接，已退回兼容结果
- `mock`：演示数据，仅用于占位说明
- `mixed`：同一聚合区块内存在多个来源状态
- `placeholder`：当前仍为占位内容，等待后续接入

统一元数据协议包括：

- `data_source`
- `degraded`
- `degrade_reason`
- `source_label`
- `source_detail`
- `is_empty`
- `is_observing`
- `sample_size`
- `empty_reason`

## 4. 已接入来源状态显示的页面与区块

### Dashboard

- 页面顶部 `SourceSummaryBar`
- 今日摘要 `SourceNotice`
- 机会区块 `SourceBadge + SourceNotice`
- 风控区块 `SourceBadge + SourceNotice`
- 组合区块 `SourceBadge + SourceNotice`
- 系统健康区块 `SourceBadge + SourceNotice`

说明：

- 9 张 KPI 未做全量显性贴标
- `real` 维持克制显示策略
- `degraded / mixed / fallback` 显性说明原因

### Research

- 页面级 `SourceSummaryBar`
- 当前 tab 标题旁 `SourceBadge`
- `factor_ic` 空表状态统一为 `real_empty`
- `attribution` 空表状态统一为 `real_empty`
- `resonance` 保持 `real`

### Execution

- 页面级 `SourceSummaryBar`
- 当前 tab 头部 `SourceBadge + SourceNotice`
- `orders / positions / fills / constraints` 支持 `real_observing` 与 `fallback` 差异表达

### System

- 页面级 `SourceSummaryBar`
- 当前 tab 头部 `SourceBadge + SourceNotice`
- 空区块正文统一从 `DataSourceMeta` 派生
- `placeholder` 与 `real_empty` 不混用

### Risk

- 页面级 `SourceSummaryBar`
- 当前 tab 头部 `SourceBadge + SourceNotice`
- `gate -> real`
- `scores -> real`
- `breakdown -> mixed`
- `events -> fallback`

### ContextPanel

- 顶部聚合区 `SourceNotice`
- 聚合态允许 `mixed`
- 本任务未继续下探子块级大量提示，避免破坏紧凑布局

## 5. 已完成的真实链路止血项

### Dashboard

- 修复真实 payload 空值触发的 `null.toFixed`
- 为 9 张 KPI 与关键摘要区块接入安全格式化
- 区分 `null / undefined / 0 / NaN / 正常 number`
- 缺值时显示安全占位，不伪造正常数字

### 统一来源状态

- 在适配层与 VM 层统一落 `DataSourceMeta`
- 页面不再各自散写来源判断
- 来源状态说明统一由组件层映射输出

## 6. 已完成的状态边界区分

### 空表

- Research `factor_ic`：`real_empty`
- Research `attribution`：`real_empty`

统一口径：

- 标题旁状态为“真实接口已接通，当前空表”
- 空态正文不使用故障语气
- 不与 `placeholder` 混用

### 观察期

- Execution `orders / positions / fills / constraints`：`real_observing`

统一口径：

- “真实数据（观察期）”
- 如有样本量则带出 `sample_size`

### 兼容结果

- Execution 局部区块在真实接口空表时退回兼容承接
- Risk `events` 当前为 `fallback`
- System 局部空区块按区块级状态表达，不再整页打成 fallback

### 降级结果

- Dashboard 真实 summary 已接通，但局部字段缺失或类型不稳时按字段级降级

### 占位内容

- System `api` 空区块当前按 `placeholder`
- 当前统一正文为“当前为占位内容，等待后续接入”

## 7. 当前仍保留的边界问题

- Dashboard 单张 KPI 的降级原因尚未逐卡显性展示
- System 部分历史空态 copy 仍保留在 VM 结构中，但显示层已优先读取 `DataSourceMeta`
- ResearchDetail 图卡占位未纳入本任务的显性接入范围
- ContextPanel 子块级提示未展开，当前保留聚合提示方案
- Execution `orders` 等区块仍属于观察期，需后续随样本增长再评估是否降噪

## 8. 若后续继续，仅建议做的小项

- 仅对 Dashboard 的 degraded KPI 增加极轻量 hover 提示
- 将 ResearchDetail 图卡占位统一接到 `placeholder` 显示组件
- 视样本稳定度，逐步降低 Execution 观察期提示强度
- 对 ContextPanel 的 degraded 子块补一个极小提示位，前提是不扰动紧凑布局

## 9. 本任务明确没有做的事

- 不重做主体页面
- 不重构 AppShell
- 不做后端接口开发
- 不改路由体系
- 不做大规模视觉改版
- 不扩散到全站中文化专项

## 10. 验收结论基础口径

截至本轮，子任务12已形成可归档的前端审计基础成果：

- Dashboard 真实链路空值炸裂已止血
- 八类来源状态已统一建模
- 重点工作区已完成最小显性标识接入
- `real_empty / real_observing / fallback / degraded / placeholder` 已完成可见区分
- 本任务收口在既定工作区内，未扩散为主体结构重写

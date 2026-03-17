# A股量化交易系统 - 前端 (ashare-frontend)

## 项目概述
A股量化交易终端前端，React 18 + TypeScript + Vite + Tailwind，部署在腾讯云服务器。
这是一套统一的量化交易工作台，覆盖每日总览、信号决策、候选跟踪、持仓管理、风控解释、研究验证、模拟执行、系统运行八大工作域。

## 技术栈
- React 18 + TypeScript + Vite
- Tailwind CSS（工具类）
- Axios（API 调用）
- React Router（路由）
- recharts + lightweight-charts（图表）
- Playwright（smoke 自动化测试，49/49 通过）

## 服务器信息
- 服务器：43.139.107.97（root 用户，SSH key 认证）
- 后端 API：http://43.139.107.97:8000
- 前端部署目录：/var/www/ashare-ui/
- 后端代码：/opt/（FastAPI，main.py 入口在 /opt/ashare-api/main.py）
- 数据库：PostgreSQL，库名 ashare
- Python 虚拟环境：/opt/ashare_venv

## 部署流程
```bash
# 1. 构建
npm run build

# 2. 部署到服务器
scp -r dist/* root@43.139.107.97:/var/www/ashare-ui/

# 3. 提交到 GitHub
git add -A && git commit -m "描述改了什么" && git push origin HEAD:main
```

## 八大工作域（前端路由）
- `/dashboard` — 每日作战室（正式首页）
- `/signals` — 信号中心（今日买点/卖点/共振/触发流）
- `/watchlist` — 交易标的池（统一候选管理）
- `/portfolio` — 持仓中心（当前持仓/已平仓/交易流水）
- `/risk` — 风控中心（Gate拦截/Score排名/四维拆解/事件流）
- `/research` — 研究中心（回测/因子IC/归因/共振）
- `/execution` — 模拟执行（预埋）
- `/system` — 系统运行中心

## 兼容路由（保留但非正式入口）
`/ignition`、`/retoc2`、`/pattern`、`/holdings`、`/backtest`

## 四大生产策略
1. **VOL_SURGE** — 连续放量蓄势
2. **RETOC2 v3** — 5分钟异动第4次触发，T+5=+6.35%，胜率68.1%
3. **T2UP9 v2** — T-2大涨蓄势，T+5=+6.01%，胜率73.5%
4. **WEAK_BUY** — 弱市吸筹，T+5=+3.04%，胜率67.8%

## 已废弃策略
IGNITE、GREEN10、延续榜（legacy 路由保留，不再调用）

## CSS 修改注意事项
- index.css 有两套设计 token，第二套（~行6390起）覆盖第一套
- **始终修改第二套或在文件末尾追加 !important**
- 修改前必须先阅读 FRONTEND_STYLE_ARCHITECTURE.md
- A股颜色约定：红=涨/买/盈利（var(--up)），绿=跌/卖/亏损（var(--down)）

## API 已联调的主接口
- `GET /api/dashboard/summary`
- `GET /api/signals/buy`、`/sell`、`/resonance`
- `GET /api/watchlist`
- `GET /api/portfolio/summary`、`/positions`、`/transactions`
- `GET /api/risk/gate_blocks`、`/top_scores`、`/risk/{ts_code}/{date}`
- `GET /api/context/stock/{ts_code}`（含 /kline、/risk、/lifecycle）
- `GET /api/backtest/summary`、`/detail`

## 关键约定
- 所有前端代码修改后，指令末尾必须包含：git add -A && git commit -m "描述" && git push origin HEAD:main
- 讨论和验证设计之后再写代码
- 一次只做一件事，完成验证后再做下一步
- 诊断问题时先确认实际数据（API响应、DOM状态、控制台输出），不写推测性修复
- 前端修改走 Cursor，不走 Claude Code

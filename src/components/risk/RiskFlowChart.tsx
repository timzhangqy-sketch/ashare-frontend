export default function RiskFlowChart() {
  return (
    <div className="rfc-wrap">
      <h3 className="rfc-title">风控全链路</h3>

      {/* Row 1: L→R */}
      <div className="rfc-row">
        <Node title="策略扫描" sub="VOL_SURGE·RETOC2·T2UP9·WEAK_BUY" />
        <Arrow />
        <Node title="个股风控" sub="Gate 7项拦截 + 四维评分(财务·市场·事件·合规)" />
        <Arrow />
        <Node title="入池检查" sub="Gate拦截股票不入池" badge="NEW" />
        <Arrow />
        <Node title="观察池" sub="20日过期 + 退出规则" />
        <Arrow />
        <Node title="买点信号" sub="突破·确认·回踩·再启" />
      </div>

      <div className="rfc-turn">↓</div>

      {/* Row 2: R→L */}
      <div className="rfc-row rfc-row-reverse">
        <Node title="仓位计算" sub="risk×regime 风险平价" />
        <Arrow left />
        <Node title="订单审批" sub="事前4项检查 + AUTO/手动" />
      </div>

      <div className="rfc-turn">↓</div>

      {/* Row 3: L→R */}
      <div className="rfc-row">
        <Node title="撮合成交" sub="T+1约束 + 涨跌停过滤" />
        <Arrow />
        <Node title="持仓管理" sub="持仓跟踪 + NAV快照" />
        <Arrow />
        <Node title="卖点信号" sub="7类：止损·回撤·环境·板块·缩量·破位·衰减" />
        <Arrow />
        <Node title="组合风控" sub="回撤≥8%熔断·连亏3笔暂停·单日限额" />
        <Arrow />
        <Node title="勾稽审计" sub="8项一致性检查" />
      </div>
    </div>
  );
}

function Node({ title, sub, badge }: { title: string; sub: string; badge?: string }) {
  return (
    <div className="rfc-node">
      <div className="rfc-node-head">
        <span className="rfc-dot" />
        <span className="rfc-node-title">{title}</span>
        {badge && <span className="rfc-badge">{badge}</span>}
      </div>
      <div className="rfc-node-sub">{sub}</div>
    </div>
  );
}

function Arrow({ left }: { left?: boolean }) {
  return <span className="rfc-arrow">{left ? '←' : '→'}</span>;
}

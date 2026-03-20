import type { StockContextMainData } from '../../../types/contextPanel'

function fmt(v: number | null | undefined, d = 2) { return v == null || Number.isNaN(v) ? '--' : v.toFixed(d) }
function fmtRatio(v: number | null | undefined) { return v == null || Number.isNaN(v) ? '--' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%` }
function pctCls(v: number | null | undefined) { return (v ?? 0) > 0 ? 'c-up' : (v ?? 0) < 0 ? 'c-down' : '' }

function Row({ label, value, cls, hero, groupStart }: { label: string; value: string | number; cls?: string; hero?: boolean; groupStart?: boolean }) {
  return (
    <div className={`ctx-row${hero ? ' ctx-hero' : ''}${groupStart ? ' ctx-group-start' : ''}`}>
      <span className="ctx-label">{label}</span>
      <span className={`ctx-val numeric ${cls ?? ''}`}>{value}</span>
    </div>
  )
}

interface Props {
  data: StockContextMainData | null
  loading: boolean
}

export default function StockContextQuote({ data, loading }: Props) {
  if (loading) return <div className="global-context-section"><div className="global-context-empty">加载中...</div></div>
  if (!data) return null

  const pctChg = data.pctChg
  const pCls = pctCls(pctChg)

  return (
    <div className="ctx-quote-grid">
      {/* Group 1: Price */}
      <Row label="收盘价" value={fmt(data.close)} cls={pCls} hero />
      <Row label="涨跌幅" value={pctChg != null ? `${pctChg >= 0 ? '+' : ''}${pctChg.toFixed(2)}%` : '--'} cls={pCls} hero />
      {/* Group 2: Trading */}
      <Row label="成交额(亿)" value={fmt(data.amountYi)} groupStart />
      <Row label="换手率%" value={fmt(data.turnoverRate)} />
      <Row label="VR量比" value={data.vr != null ? `${fmt(data.vr)}x` : '--'} />
      {/* Group 3: MA */}
      <Row label="MA5" value={fmt(data.ma5)} groupStart />
      <Row label="MA10" value={fmt(data.ma10)} />
      <Row label="MA20" value={fmt(data.ma20)} />
      <Row label="距MA20" value={fmtRatio(data.closeVsMa20Pct)} cls={pctCls(data.closeVsMa20Pct)} />
      {/* Group 4: Valuation */}
      <Row label="PE(TTM)" value={fmt(data.peTtm, 1)} groupStart />
      <Row label="PB" value={fmt(data.pb)} />
      <Row label="市值(亿)" value={fmt(data.totalMvYi, 1)} />
      {/* Group 5: Industry */}
      <Row label="行业" value={data.industry ?? '--'} groupStart />
      {/* Group 6: Trend */}
      <Row label="5日涨幅" value={fmtRatio(data.pctChg5d)} cls={pctCls(data.pctChg5d)} groupStart />
      <Row label="10日涨幅" value={fmtRatio(data.pctChg10d)} cls={pctCls(data.pctChg10d)} />
      <Row label="20日涨幅" value={fmtRatio(data.pctChg20d)} cls={pctCls(data.pctChg20d)} />
      {/* Group 7: Range */}
      {data.high60d != null && (
        <Row label="60日区间" value={`${fmt(data.low60d)} ~ ${fmt(data.high60d)}`} groupStart />
      )}
    </div>
  )
}

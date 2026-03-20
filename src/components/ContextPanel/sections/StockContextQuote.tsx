import type { StockContextMainData } from '../../../types/contextPanel'

function fmt(v: number | null | undefined, d = 2) { return v == null || Number.isNaN(v) ? '--' : v.toFixed(d) }
function fmtRatio(v: number | null | undefined) { return v == null || Number.isNaN(v) ? '--' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%` }
function pctCls(v: number | null | undefined) { return (v ?? 0) > 0 ? 'c-up' : (v ?? 0) < 0 ? 'c-down' : '' }

function Cell({ label, value, cls, span2, hero }: { label: string; value: string | number; cls?: string; span2?: boolean; hero?: boolean }) {
  return (
    <div className={`ctx-cell${span2 ? ' ctx-span2' : ''}${hero ? ' ctx-hero' : ''}`}>
      <div className="ctx-label">{label}</div>
      <div className={`ctx-val numeric ${cls ?? ''}`}>{value}</div>
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
      <Cell label="收盘价" value={fmt(data.close)} cls={pCls} hero />
      <Cell label="涨跌幅" value={pctChg != null ? `${pctChg >= 0 ? '+' : ''}${pctChg.toFixed(2)}%` : '--'} cls={pCls} hero />
      <Cell label="成交额(亿)" value={fmt(data.amountYi)} />
      <Cell label="换手率%" value={fmt(data.turnoverRate)} />
      <Cell label="MA5" value={fmt(data.ma5)} />
      <Cell label="MA10" value={fmt(data.ma10)} />
      <Cell label="MA20" value={fmt(data.ma20)} />
      <Cell label="VR量比" value={data.vr != null ? `${fmt(data.vr)}x` : '--'} />
      <Cell label="PE(TTM)" value={fmt(data.peTtm, 1)} />
      <Cell label="PB" value={fmt(data.pb)} />
      <Cell label="市值(亿)" value={fmt(data.totalMvYi, 1)} />
      <Cell label="行业" value={data.industry ?? '--'} />
      <Cell label="5日涨幅" value={fmtRatio(data.pctChg5d)} cls={pctCls(data.pctChg5d)} />
      <Cell label="10日涨幅" value={fmtRatio(data.pctChg10d)} cls={pctCls(data.pctChg10d)} />
      <Cell label="20日涨幅" value={fmtRatio(data.pctChg20d)} cls={pctCls(data.pctChg20d)} />
      <Cell label="距MA20" value={fmtRatio(data.closeVsMa20Pct)} cls={pctCls(data.closeVsMa20Pct)} />
      {data.high60d != null && (
        <Cell label="60日区间" value={`${fmt(data.low60d)} ~ ${fmt(data.high60d)}`} span2 />
      )}
    </div>
  )
}

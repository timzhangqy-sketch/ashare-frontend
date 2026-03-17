import { useRef, useEffect, useState, useCallback } from 'react'
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
} from 'lightweight-charts'
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts'
import { fetchKline, type KlineItem } from '../../api'

type CandleBar = {
  time: Time
  open: number
  high: number
  low: number
  close: number
  volume: number
}

function isDarkMode() {
  return document.documentElement.getAttribute('data-theme') !== 'light'
}

function chartTheme(dark: boolean) {
  return {
    layout: {
      background: { color: dark ? '#101821' : '#FFFFFF' },
      textColor: dark ? '#98A3B8' : '#667085',
    },
    grid: {
      vertLines: { color: dark ? '#1E293B' : '#E7ECF3' },
      horzLines: { color: dark ? '#1E293B' : '#E7ECF3' },
    },
    rightPriceScale: { borderColor: dark ? '#2A374B' : '#D7DEE8' },
    timeScale: { borderColor: dark ? '#2A374B' : '#D7DEE8', timeVisible: false },
  }
}

function candleColors(dark: boolean) {
  const up = dark ? '#FF4D4F' : '#C82333'
  const down = dark ? '#00B96B' : '#2F9E5B'
  return {
    upColor: up,
    downColor: down,
    borderUpColor: up,
    borderDownColor: down,
    wickUpColor: up,
    wickDownColor: down,
  }
}

function volColor(item: { open: number; close: number }, dark: boolean) {
  const up = item.close >= item.open
  return up
    ? dark ? 'rgba(255,77,79,0.42)' : 'rgba(200,35,51,0.38)'
    : dark ? 'rgba(0,185,107,0.42)' : 'rgba(47,158,91,0.38)'
}

function PeriodButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button type="button" className={`btn-ghost drawer-period-btn${active ? ' active' : ''}`} onClick={onClick}>
      {label}
    </button>
  )
}

interface Props {
  tsCode: string
  /** 建仓均价，在 K 线上叠加虚线横线并标注 */
  avgCost?: number
}

function getWarnColor(): string {
  if (typeof document === 'undefined') return '#F59E0B'
  return getComputedStyle(document.documentElement).getPropertyValue('--warn').trim() || '#F59E0B'
}

function toWeeklyBars(dailyBars: CandleBar[]): CandleBar[] {
  const weeks: Record<string, CandleBar> = {}

  dailyBars.forEach((bar) => {
    const rawTime = bar.time as unknown
    const date = typeof rawTime === 'string'
      ? new Date(rawTime)
      : new Date((rawTime as number) * 1000)
    if (Number.isNaN(date.getTime())) return

    const day = date.getDay()
    const diff = date.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(date)
    monday.setDate(diff)
    const weekKey = monday.toISOString().split('T')[0]

    if (!weeks[weekKey]) {
      weeks[weekKey] = {
        time: weekKey as Time,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      }
    } else {
      const w = weeks[weekKey]
      w.high = Math.max(w.high, bar.high)
      w.low = Math.min(w.low, bar.low)
      w.close = bar.close
      w.volume += bar.volume
    }
  })

  return Object.values(weeks).sort((a, b) => {
    const at = a.time as string
    const bt = b.time as string
    return at.localeCompare(bt)
  })
}

export default function KlineChart({ tsCode, avgCost }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const ma5Ref = useRef<ISeriesApi<'Line'> | null>(null)
  const ma10Ref = useRef<ISeriesApi<'Line'> | null>(null)
  const ma20Ref = useRef<ISeriesApi<'Line'> | null>(null)
  const volRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const avgCostLineRef = useRef<ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']> | null>(null)

  const [chartMode, setChartMode] = useState<'daily' | 'weekly'>('daily')
  const [fetchState, setFetchState] = useState<{ key: string | null; items: KlineItem[]; hasError: boolean }>({
    key: null,
    items: [],
    hasError: false,
  })

  const applyData = useCallback((items: KlineItem[], mode: 'daily' | 'weekly', cost?: number) => {
    if (!candleRef.current || !items.length) return
    const dark = isDarkMode()

    const dailyBars: CandleBar[] = items.map((item) => ({
      time: item.date as Time,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      volume: item.volume,
    }))

    const bars = mode === 'daily' ? dailyBars : toWeeklyBars(dailyBars)

    candleRef.current.applyOptions(candleColors(dark))
    candleRef.current.setData(bars)

    if (avgCostLineRef.current) {
      candleRef.current.removePriceLine(avgCostLineRef.current)
      avgCostLineRef.current = null
    }
    if (cost != null && typeof cost === 'number' && !Number.isNaN(cost)) {
      avgCostLineRef.current = candleRef.current.createPriceLine({
        price: cost,
        color: getWarnColor(),
        lineStyle: 2,
        axisLabelVisible: true,
        title: `均价 ${cost.toFixed(2)}`,
      })
    }

    if (mode === 'daily') {
      ma5Ref.current?.setData(items.filter((item) => item.ma5 != null).map((item) => ({ time: item.date as Time, value: item.ma5! })))
      ma10Ref.current?.setData(items.filter((item) => item.ma10 != null).map((item) => ({ time: item.date as Time, value: item.ma10! })))
      ma20Ref.current?.setData(items.filter((item) => item.ma20 != null).map((item) => ({ time: item.date as Time, value: item.ma20! })))
    } else {
      ma5Ref.current?.setData([])
      ma10Ref.current?.setData([])
      ma20Ref.current?.setData([])
    }

    volRef.current?.setData(
      bars.map((bar) => ({
        time: bar.time,
        value: bar.volume,
        color: volColor(bar, dark),
      })),
    )

    if (bars.length > 0) {
      const lastIndex = bars.length - 1
      const startIndex = Math.max(0, lastIndex - 119)
      chartRef.current?.timeScale().setVisibleRange({
        from: bars[startIndex].time,
        to: bars[lastIndex].time,
      })
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current) return

    const dark = isDarkMode()
    const chart = createChart(containerRef.current, {
      ...chartTheme(dark),
      width: containerRef.current.clientWidth || 600,
      height: 300,
      crosshair: { mode: 1 },
      localization: { locale: 'zh-CN' },
    })
    chartRef.current = chart

    candleRef.current = chart.addSeries(CandlestickSeries, candleColors(dark))

    const lineBase = {
      lineWidth: 1 as const,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    }
    ma5Ref.current = chart.addSeries(LineSeries, { ...lineBase, color: '#3B82F6' })
    ma10Ref.current = chart.addSeries(LineSeries, { ...lineBase, color: '#F59E0B' })
    ma20Ref.current = chart.addSeries(LineSeries, { ...lineBase, color: '#8B5CF6' })

    volRef.current = chart.addSeries(HistogramSeries, {
      priceScaleId: 'vol',
      priceFormat: { type: 'volume' },
    })
    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    })

    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth })
    })
    resizeObserver.observe(containerRef.current)

    const mutationObserver = new MutationObserver(() => {
      const currentDark = isDarkMode()
      chart.applyOptions(chartTheme(currentDark))
      candleRef.current?.applyOptions(candleColors(currentDark))
    })
    mutationObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    return () => {
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      chart.remove()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!tsCode) return

    const requestKey = `${tsCode}:360`
    let cancelled = false

    fetchKline(tsCode, 360)
      .then((items) => {
        if (cancelled) return
        setFetchState({ key: requestKey, items, hasError: false })
      })
      .catch(() => {
        if (cancelled) return
        setFetchState({ key: requestKey, items: [], hasError: true })
      })

    return () => {
      cancelled = true
    }
  }, [tsCode])

  const requestKey = tsCode ? `${tsCode}:360` : null
  const loading = Boolean(requestKey) && fetchState.key !== requestKey
  const hasError = Boolean(requestKey) && fetchState.key === requestKey && fetchState.hasError
  const items = fetchState.key === requestKey ? fetchState.items : []

  useEffect(() => {
    if (!requestKey || loading || hasError || !items.length) return
    applyData(items, chartMode, avgCost)
  }, [applyData, chartMode, hasError, items, loading, requestKey, avgCost])

  return (
    <section className="drawer-section-block">
      <div className="drawer-section-head">
        <div>
          <div className="drawer-section-title">K 线走势</div>
          <div className="drawer-section-meta">
            <span>MA5</span>
            <span className="drawer-legend-item legend-blue">线</span>
            <span>MA10</span>
            <span className="drawer-legend-item legend-amber">线</span>
            <span>MA20</span>
            <span className="drawer-legend-item legend-violet">线</span>
          </div>
        </div>
        <div className="drawer-period-switch">
          <PeriodButton label="日线" active={chartMode === 'daily'} onClick={() => setChartMode('daily')} />
          <PeriodButton label="周线" active={chartMode === 'weekly'} onClick={() => setChartMode('weekly')} />
        </div>
      </div>

      <div className="drawer-card drawer-chart-card">
        {loading ? (
          <div className="drawer-chart-state">
            <div className="spinner" />
            <span>加载 K 线数据中...</span>
          </div>
        ) : null}

        {hasError && !loading ? <div className="drawer-chart-state">K 线数据加载失败</div> : null}

        <div
          ref={containerRef}
          className="drawer-chart-canvas"
          style={{ visibility: loading || hasError ? 'hidden' : 'visible' }}
        />
      </div>
    </section>
  )
}

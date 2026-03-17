import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { fetchTradeDates } from '../api';
import { DateContext } from './useDate';

function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Snap backward past weekends (weekend-only fallback). */
function snapToWeekday(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return toLocalISODate(d);
}

/** Step one trading day using a sorted list; fall back to weekend-skip. */
function stepInList(sorted: string[], current: string, dir: 1 | -1): string {
  if (sorted.length === 0) {
    const d = new Date(current + 'T00:00:00');
    do { d.setDate(d.getDate() + dir); } while (d.getDay() === 0 || d.getDay() === 6);
    return toLocalISODate(d);
  }
  const idx = sorted.indexOf(current);
  if (idx !== -1) {
    const next = idx + dir;
    return next >= 0 && next < sorted.length ? sorted[next] : current;
  }
  // current not in list — find nearest neighbour
  if (dir === 1) return sorted.find(d => d > current) ?? current;
  return [...sorted].reverse().find(d => d < current) ?? current;
}

/** Find the latest trading day in sorted list that is ≤ today. */
function latestInList(sorted: string[]): string {
  const today = toLocalISODate(new Date());
  return [...sorted].reverse().find(d => d <= today) ?? sorted.at(-1) ?? snapToWeekday(today);
}

const FALLBACK_DATE = snapToWeekday(toLocalISODate(new Date()));

export function DateProvider({ children }: { children: ReactNode }) {
  const [selectedDate,    _setRaw]       = useState(FALLBACK_DATE);
  const [tradeDates,      setTradeDates] = useState<string[]>([]);
  const [tradeDatesReady, setReady]      = useState(false);
  const [toastVisible,    setToastVisible] = useState(false);

  // Keep a ref so the poll callback can read the current selectedDate without stale closure
  const selectedDateRef = useRef(selectedDate);
  useEffect(() => { selectedDateRef.current = selectedDate; }, [selectedDate]);

  // Fetch trade calendar once on mount
  useEffect(() => {
    fetchTradeDates()
      .then(dates => {
        const sorted = [...dates].sort();
        setTradeDates(sorted);
        setReady(true);
        _setRaw(latestInList(sorted));
      })
      .catch(() => {
        // API unavailable — keep weekend-snap fallback, still mark ready
        setReady(true);
      });
  }, []);

  // Auto-refresh every 5 minutes, only between 18:00–20:00
  useEffect(() => {
    if (!tradeDatesReady) return;

    const check = () => {
      const h = new Date().getHours();
      if (h < 18 || h >= 20) return;

      fetchTradeDates()
        .then(dates => {
          const sorted = [...dates].sort();
          const latest = latestInList(sorted);
          setTradeDates(sorted);
          if (latest > selectedDateRef.current) {
            _setRaw(latest);
            setToastVisible(true);
          }
        })
        .catch(() => {});
    };

    const id = setInterval(check, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [tradeDatesReady]);

  // Auto-dismiss toast after 3 seconds
  useEffect(() => {
    if (!toastVisible) return;
    const id = setTimeout(() => setToastVisible(false), 3000);
    return () => clearTimeout(id);
  }, [toastVisible]);

  const setSelectedDate = (d: string) => {
    if (tradeDates.length === 0) {
      _setRaw(snapToWeekday(d));
      return;
    }
    const snapped = [...tradeDates].filter(td => td <= d).at(-1);
    _setRaw(snapped ?? tradeDates[0]);
  };

  const prevTradingDay = () => _setRaw(cur => stepInList(tradeDates, cur, -1));
  const nextTradingDay = () => _setRaw(cur => stepInList(tradeDates, cur,  1));

  const latestAvailable = tradeDates.length > 0 ? latestInList(tradeDates) : FALLBACK_DATE;
  const isToday = selectedDate === latestAvailable;

  return (
    <DateContext.Provider
      value={{ selectedDate, setSelectedDate, prevTradingDay, nextTradingDay, isToday, tradeDatesReady }}
    >
      {children}
      {toastVisible && (
        <div style={{
          position:     'fixed',
          bottom:       24,
          right:        24,
          background:   '#52c41a',
          color:        '#fff',
          padding:      '10px 18px',
          borderRadius: 8,
          fontSize:     14,
          fontWeight:   600,
          boxShadow:    '0 4px 16px rgba(0,0,0,0.35)',
          zIndex:       9999,
          pointerEvents: 'none',
          animation:    'toast-in 0.2s ease',
        }}>
          📊 今日数据已更新
        </div>
      )}
    </DateContext.Provider>
  );
}

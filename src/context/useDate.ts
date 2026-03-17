import { createContext, useContext } from 'react'

export interface DateContextType {
  selectedDate: string
  setSelectedDate: (d: string) => void
  prevTradingDay: () => void
  nextTradingDay: () => void
  isToday: boolean
  tradeDatesReady: boolean
}

export const DateContext = createContext<DateContextType | null>(null)

export function useDate(): DateContextType {
  const ctx = useContext(DateContext)
  if (!ctx) throw new Error('useDate must be used within <DateProvider>')
  return ctx
}

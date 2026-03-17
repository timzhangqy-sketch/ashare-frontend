import { createContext, useContext } from 'react'

export interface CrossStrategyContextType {
  crossMap: Record<string, string[]>
}

export const CrossStrategyContext = createContext<CrossStrategyContextType>({ crossMap: {} })

export function useCrossStrategy(): CrossStrategyContextType {
  return useContext(CrossStrategyContext)
}

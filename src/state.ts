import { createContext, useContext } from 'react'
import type { Transaction, ImportBatch } from './lib/types'
import type { UserRule } from './lib/categorize'

export type Status = 'loading' | 'ready' | 'error'

export interface StateValue {
  status: Status
  error: string | null
  transactions: Transaction[]
  rules: UserRule[]
  batches: ImportBatch[]
  /** Timestamp of the most recent import, used to mark what is new. */
  latestImportAt: string | null
  commitImport: (
    incoming: Transaction[],
    meta: { fileName: string; errors: number },
  ) => Promise<{ added: number; duplicates: number }>
  setCategory: (id: string, category: string) => void
  addRule: (rule: UserRule, applyToExisting: boolean) => void
  removeRule: (pattern: string) => void
  eraseEverything: () => Promise<void>
}

export const StateContext = createContext<StateValue | null>(null)

export function useStore(): StateValue {
  const context = useContext(StateContext)
  if (!context) throw new Error('useStore must be used inside a StateProvider')
  return context
}

import { createContext, useContext } from 'react'
import type { Transaction, ImportBatch } from './lib/types'
import type { UserRule } from './lib/categorize'
import type { Settings } from './lib/storage'

export type Status = 'loading' | 'ready' | 'error'

export interface StateValue {
  status: Status
  error: string | null
  transactions: Transaction[]
  rules: UserRule[]
  batches: ImportBatch[]
  settings: Settings
  /** Timestamp of the most recent import, used to mark what is new. */
  latestImportAt: string | null
  commitImport: (
    incoming: Transaction[],
    meta: { fileName: string; errors: number },
  ) => Promise<{ added: number; duplicates: number }>
  setCategory: (id: string, category: string) => void
  addRule: (rule: UserRule, applyToExisting: boolean) => void
  removeRule: (pattern: string) => void
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  /** Rewrite stored descriptions to remove account numbers already saved. */
  scrubStoredAccountNumbers: () => Promise<number>
  eraseEverything: () => Promise<void>
}

export const StateContext = createContext<StateValue | null>(null)

export function useStore(): StateValue {
  const context = useContext(StateContext)
  if (!context) throw new Error('useStore must be used inside a StateProvider')
  return context
}

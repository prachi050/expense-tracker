import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { ImportBatch } from './lib/types'
import type { UserRule } from './lib/categorize'
import { categorize } from './lib/categorize'
import { EMPTY_DATABASE, readDatabase, type Database, type Settings } from './lib/storage'
import { maskAccountNumbers } from './lib/redact'
import { merchantKey } from './lib/merchant'
import { mergeTransactions } from './lib/import'
import { StateContext, type StateValue, type Status } from './state'

export function StateProvider({ children }: { children: ReactNode }) {
  const [database, setDatabase] = useState<Database>(EMPTY_DATABASE)
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string | null>(null)
  const loaded = useRef(false)

  useEffect(() => {
    let cancelled = false
    window.expenses
      .load()
      .then((raw) => {
        if (cancelled) return
        setDatabase(raw ? readDatabase(raw) : EMPTY_DATABASE)
        loaded.current = true
        setStatus('ready')
      })
      .catch((loadError: Error) => {
        if (cancelled) return
        // Deliberately do not fall back to an empty database: saving over a
        // file we failed to read would destroy it.
        setError(loadError.message)
        setStatus('error')
      })
    return () => { cancelled = true }
  }, [])

  const persist = useCallback(async (next: Database) => {
    setDatabase(next)
    if (!loaded.current) return
    try {
      await window.expenses.save(next)
    } catch (saveError) {
      setError((saveError as Error).message)
    }
  }, [])

  const commitImport = useCallback<StateValue['commitImport']>(
    async (incoming, meta) => {
      // Stamp the rows with the batch's own time. They were parsed a moment
      // earlier, and if the two timestamps differ nothing can ever be matched
      // up as "new since the last import".
      const importedAt = new Date().toISOString()
      const stamped = incoming.map((txn) => ({ ...txn, importedAt }))
      const { merged, added, duplicates } = mergeTransactions(database.transactions, stamped)
      const batch: ImportBatch = {
        id: `${Date.now()}-${meta.fileName}`,
        importedAt,
        fileName: meta.fileName,
        added,
        duplicates,
        errors: meta.errors,
      }
      await persist({ ...database, transactions: merged, batches: [batch, ...database.batches] })
      return { added, duplicates }
    },
    [database, persist],
  )

  const setCategory = useCallback(
    (id: string, category: string) => {
      const transactions = database.transactions.map((txn) =>
        txn.id === id
          ? { ...txn, category, categorySource: 'user' as const, ruleConfidence: 'high' as const }
          : txn,
      )
      void persist({ ...database, transactions })
    },
    [database, persist],
  )

  const addRule = useCallback(
    (rule: UserRule, applyToExisting: boolean) => {
      const rules = [rule, ...database.rules.filter((r) => r.pattern !== rule.pattern)]
      let transactions = database.transactions
      if (applyToExisting) {
        transactions = transactions.map((txn) => {
          // A category the user set by hand is never overwritten by a rule.
          if (txn.categorySource === 'user') return txn
          const guess = categorize(txn.description, txn.amountCents, txn.kind, rules)
          return { ...txn, category: guess.category, ruleConfidence: guess.confidence }
        })
      }
      void persist({ ...database, rules, transactions })
    },
    [database, persist],
  )

  const removeRule = useCallback(
    (pattern: string) => {
      void persist({ ...database, rules: database.rules.filter((r) => r.pattern !== pattern) })
    },
    [database, persist],
  )

  const categorizeMerchant = useCallback(
    (merchant: string, category: string) => {
      const transactions = database.transactions.map((txn) =>
        merchantKey(txn.description) === merchant
          ? { ...txn, category, categorySource: 'user' as const, ruleConfidence: 'high' as const }
          : txn,
      )
      // Stored as a rule too, so the next statement files it automatically.
      const rules = [
        { pattern: merchant, category },
        ...database.rules.filter((rule) => rule.pattern !== merchant),
      ]
      void persist({ ...database, transactions, rules })
    },
    [database, persist],
  )

  const setSetting = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      void persist({ ...database, settings: { ...database.settings, [key]: value } })
    },
    [database, persist],
  )

  const scrubStoredAccountNumbers = useCallback(async () => {
    let changed = 0
    const transactions = database.transactions.map((txn) => {
      const masked = maskAccountNumbers(txn.description)
      if (masked === txn.description) return txn
      changed += 1
      return { ...txn, description: masked }
    })
    if (changed > 0) await persist({ ...database, transactions })
    return changed
  }, [database, persist])

  const eraseEverything = useCallback(async () => {
    await persist(EMPTY_DATABASE)
  }, [persist])

  const latestImportAt = useMemo(() => {
    if (database.batches.length === 0) return null
    return database.batches.reduce(
      (latest, batch) => (batch.importedAt > latest ? batch.importedAt : latest),
      database.batches[0].importedAt,
    )
  }, [database.batches])

  const value = useMemo<StateValue>(
    () => ({
      status,
      error,
      transactions: database.transactions,
      rules: database.rules,
      batches: database.batches,
      settings: database.settings,
      latestImportAt,
      commitImport,
      setCategory,
      addRule,
      removeRule,
      categorizeMerchant,
      setSetting,
      scrubStoredAccountNumbers,
      eraseEverything,
    }),
    [status, error, database, latestImportAt, commitImport, setCategory, addRule, removeRule, categorizeMerchant, setSetting, scrubStoredAccountNumbers, eraseEverything],
  )

  return <StateContext.Provider value={value}>{children}</StateContext.Provider>
}

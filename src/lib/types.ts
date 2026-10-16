export interface Transaction {
  /** Stable across re-imports of the same statement, so duplicates collapse. */
  id: string
  /** YYYY-MM-DD */
  date: string
  description: string
  /** Signed integer cents. Negative is money leaving the account. */
  amountCents: number
  balanceCents: number | null
  category: string
  /** Where the category came from, so user choices are never overwritten. */
  categorySource: 'user' | 'rule' | 'uncategorized'
  /** Confidence of the rule that matched, for surfacing uncertain guesses. */
  ruleConfidence: 'high' | 'low' | 'none'
  /** File this row came from. */
  source: string
  /** ISO timestamp of the import batch that first introduced this row. */
  importedAt: string
  /** Counterparty for incoming money, e.g. the Zelle sender. */
  counterparty: string | null
  kind: TransactionKind
}

export type TransactionKind =
  | 'zelle-in'
  | 'zelle-out'
  | 'deposit'
  | 'transfer'
  | 'refund'
  | 'spend'

export interface RowError {
  /** 1-based line number in the original file, for finding it again. */
  line: number
  reason: string
  raw: string[]
}

export interface ImportResult {
  transactions: Transaction[]
  errors: RowError[]
  /** Rows the file contained, excluding the header and blank lines. */
  dataRowCount: number
  /** Sum of everything parsed, in cents. */
  netCents: number
  inflowCents: number
  outflowCents: number
}

export interface ImportBatch {
  id: string
  importedAt: string
  fileName: string
  added: number
  duplicates: number
  errors: number
}

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CATEGORIES } from '../lib/categorize'
import { formatDate } from '../lib/dates'
import { merchantKey, merchantOf } from '../lib/merchant'
import { formatMoney } from '../lib/money'
import { useStore } from '../state'
import type { Transaction } from '../lib/types'

interface Group {
  key: string
  name: string
  transactions: Transaction[]
  cents: number
}

/**
 * Everything the rules could not place, grouped by merchant. Categorising a
 * group settles every transaction from that merchant at once and remembers
 * the choice, so the same merchant is filed automatically next time.
 */
export default function TidyPage() {
  const { transactions, categorizeMerchant } = useStore()
  const [includeUnsure, setIncludeUnsure] = useState(true)
  const [justDone, setJustDone] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const groups = useMemo<Group[]>(() => {
    const needing = transactions.filter((txn) => {
      if (txn.categorySource === 'user') return false
      if (txn.category === 'Uncategorized') return true
      return includeUnsure && txn.ruleConfidence === 'low'
    })

    const byMerchant = new Map<string, Group>()
    for (const txn of needing) {
      const key = merchantKey(txn.description) || txn.description
      const existing = byMerchant.get(key)
      if (existing) {
        existing.transactions.push(txn)
        existing.cents += txn.amountCents
      } else {
        byMerchant.set(key, {
          key,
          name: merchantOf(txn.description),
          transactions: [txn],
          cents: txn.amountCents,
        })
      }
    }

    // Biggest spend first: fixing those changes the picture most.
    return [...byMerchant.values()].sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents))
  }, [transactions, includeUnsure])

  const total = groups.reduce((sum, group) => sum + group.transactions.length, 0)

  if (transactions.length === 0) {
    return (
      <div className="hero rounded-box bg-base-100 py-16">
        <div className="hero-content flex-col text-center">
          <h1 className="text-2xl font-black">Nothing to tidy yet</h1>
          <Link to="/import" className="btn btn-primary">Import a statement</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Give these a category</h1>
          <p className="mt-1 text-sm opacity-70">
            Grouped by merchant and ordered by how much is involved. Choosing a category settles
            every transaction from that merchant and files it the same way next time.
          </p>
        </div>
        <label className="label cursor-pointer gap-2">
          <input type="checkbox" className="toggle toggle-sm" checked={includeUnsure}
            onChange={(event) => setIncludeUnsure(event.target.checked)} />
          <span className="label-text text-sm">Include uncertain guesses</span>
        </label>
      </header>

      {justDone ? <div className="alert alert-success text-sm">{justDone}</div> : null}

      {groups.length === 0 ? (
        <div className="card bg-base-100 shadow">
          <div className="card-body items-center py-12 text-center">
            <span className="text-4xl" aria-hidden="true">✓</span>
            <h2 className="text-lg font-bold">Everything has a category</h2>
            <Link to="/" className="link link-primary text-sm">Back to the overview</Link>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm opacity-70">
            {groups.length} merchant{groups.length === 1 ? '' : 's'}, {total} transaction
            {total === 1 ? '' : 's'}.
          </p>

          <ul className="flex flex-col gap-2">
            {groups.map((group) => (
              <li key={group.key} className="card bg-base-100 shadow">
                <div className="card-body gap-2 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{group.name}</div>
                      <button
                        type="button"
                        className="link link-hover text-xs opacity-60"
                        onClick={() => setExpanded(expanded === group.key ? null : group.key)}
                      >
                        {group.transactions.length} transaction
                        {group.transactions.length === 1 ? '' : 's'} ·{' '}
                        {formatMoney(Math.abs(group.cents))} · {expanded === group.key ? 'hide' : 'show'}
                      </button>
                    </div>

                    <select
                      className="select select-sm select-bordered w-48"
                      defaultValue=""
                      onChange={(event) => {
                        if (!event.target.value) return
                        categorizeMerchant(group.key, event.target.value)
                        setJustDone(
                          `${group.name} filed under ${event.target.value}. ${group.transactions.length} transaction${group.transactions.length === 1 ? '' : 's'} updated.`,
                        )
                      }}
                    >
                      <option value="" disabled>Choose a category</option>
                      {CATEGORIES.filter((name) => name !== 'Uncategorized').map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>

                  {expanded === group.key ? (
                    <table className="table table-xs">
                      <tbody>
                        {group.transactions.map((txn) => (
                          <tr key={txn.id}>
                            <td className="tabular whitespace-nowrap">{formatDate(txn.date)}</td>
                            <td className="max-w-md truncate text-xs opacity-70">{txn.description}</td>
                            <td className="tabular text-right">{formatMoney(txn.amountCents)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

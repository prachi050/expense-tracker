import { useMemo, useState } from 'react'
import { CATEGORIES } from '../lib/categorize'
import { formatDate, formatMonth, monthKey } from '../lib/dates'
import { formatMoney } from '../lib/money'
import { availableMonths } from '../lib/summary'
import { useStore } from '../state'

export default function TransactionsPage() {
  const { transactions, setCategory, addRule } = useStore()
  const [month, setMonth] = useState('all')
  const [category, setCategoryFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [onlyUnsure, setOnlyUnsure] = useState(false)
  const [ruleFor, setRuleFor] = useState<{ pattern: string; category: string } | null>(null)

  const months = useMemo(() => availableMonths(transactions), [transactions])

  const rows = useMemo(() => {
    const needle = query.trim().toUpperCase()
    return transactions.filter((txn) => {
      if (month !== 'all' && monthKey(txn.date) !== month) return false
      if (category !== 'all' && txn.category !== category) return false
      if (onlyUnsure && txn.categorySource === 'user') return false
      if (onlyUnsure && txn.ruleConfidence === 'high') return false
      if (needle && !txn.description.toUpperCase().includes(needle)) return false
      return true
    })
  }, [transactions, month, category, query, onlyUnsure])

  const unsureCount = useMemo(
    () => transactions.filter((txn) => txn.categorySource !== 'user' && txn.ruleConfidence !== 'high').length,
    [transactions],
  )

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Transactions</h1>
          <p className="text-sm opacity-70">
            Change any category here. Your choice is kept and never overwritten by a rule.
          </p>
        </div>
        {unsureCount > 0 ? (
          <button
            type="button"
            className={`btn btn-sm ${onlyUnsure ? 'btn-warning' : 'btn-outline btn-warning'}`}
            onClick={() => setOnlyUnsure((value) => !value)}
          >
            {unsureCount} need{unsureCount === 1 ? 's' : ''} a look
          </button>
        ) : null}
      </header>

      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          className="input input-bordered input-sm w-56"
          placeholder="Search descriptions"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select className="select select-bordered select-sm" value={month}
          onChange={(event) => setMonth(event.target.value)} aria-label="Period">
          <option value="all">All months</option>
          {months.map((key) => <option key={key} value={key}>{formatMonth(key)}</option>)}
        </select>
        <select className="select select-bordered select-sm" value={category}
          onChange={(event) => setCategoryFilter(event.target.value)} aria-label="Category">
          <option value="all">All categories</option>
          {CATEGORIES.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <span className="ml-auto self-center text-sm opacity-70">{rows.length} shown</span>
      </div>

      <section className="card bg-base-100 shadow">
        <div className="card-body p-0">
          <div className="overflow-x-auto">
            <table className="table table-sm table-pin-rows">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th className="text-right">Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((txn) => (
                  <tr key={txn.id}>
                    <td className="tabular whitespace-nowrap">{formatDate(txn.date)}</td>
                    <td className="max-w-md">
                      <span className="block truncate" title={txn.description}>{txn.description}</span>
                      <span className="text-xs opacity-50">{txn.source}</span>
                    </td>
                    <td>
                      <select
                        className={`select select-xs select-bordered w-44 ${
                          txn.categorySource !== 'user' && txn.ruleConfidence !== 'high'
                            ? 'select-warning'
                            : ''
                        }`}
                        value={txn.category}
                        onChange={(event) => setCategory(txn.id, event.target.value)}
                      >
                        {CATEGORIES.map((name) => <option key={name} value={name}>{name}</option>)}
                      </select>
                    </td>
                    <td className={`tabular whitespace-nowrap text-right font-semibold ${
                      txn.amountCents < 0 ? '' : 'text-success'
                    }`}>
                      {formatMoney(txn.amountCents)}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        title="Always use this category for similar descriptions"
                        onClick={() =>
                          setRuleFor({
                            pattern: txn.description.split(/\s{2,}|\s#|\s\d{3,}/)[0].slice(0, 28).trim(),
                            category: txn.category,
                          })
                        }
                      >
                        Rule
                      </button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr><td colSpan={5} className="py-8 text-center text-sm opacity-60">
                    Nothing matches those filters.
                  </td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {ruleFor ? (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="text-lg font-bold">Always categorise this merchant</h3>
            <p className="py-2 text-sm opacity-70">
              Any description containing this text will be filed under the category you pick.
            </p>
            <label className="form-control">
              <span className="label-text text-xs">Text to match</span>
              <input
                className="input input-bordered input-sm"
                value={ruleFor.pattern}
                onChange={(event) => setRuleFor({ ...ruleFor, pattern: event.target.value })}
              />
            </label>
            <label className="form-control mt-2">
              <span className="label-text text-xs">Category</span>
              <select
                className="select select-bordered select-sm"
                value={ruleFor.category}
                onChange={(event) => setRuleFor({ ...ruleFor, category: event.target.value })}
              >
                {CATEGORIES.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <div className="modal-action">
              <button type="button" className="btn btn-ghost" onClick={() => setRuleFor(null)}>Cancel</button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={ruleFor.pattern.trim().length < 2}
                onClick={() => {
                  addRule({ pattern: ruleFor.pattern.trim(), category: ruleFor.category }, true)
                  setRuleFor(null)
                }}
              >
                Save rule and apply
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop" onClick={() => setRuleFor(null)}>
            <button type="button">close</button>
          </form>
        </dialog>
      ) : null}
    </div>
  )
}

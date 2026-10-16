import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CategoryBars } from '../components/CategoryBars'
import { formatDate, formatMonth, monthKey } from '../lib/dates'
import { formatMoney } from '../lib/money'
import { availableMonths, categoryTotals, incomingTransactions, summarise } from '../lib/summary'
import { useStore } from '../state'

export default function DashboardPage() {
  const { transactions, latestImportAt } = useStore()
  const months = useMemo(() => availableMonths(transactions), [transactions])
  const [month, setMonth] = useState<string>('all')

  const scoped = useMemo(
    () => (month === 'all' ? transactions : transactions.filter((txn) => monthKey(txn.date) === month)),
    [transactions, month],
  )

  const summary = useMemo(() => summarise(scoped), [scoped])
  const totals = useMemo(() => categoryTotals(scoped), [scoped])

  const newIncoming = useMemo(() => {
    if (!latestImportAt) return []
    return incomingTransactions(transactions)
      .filter((txn) => txn.importedAt === latestImportAt)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 6)
  }, [transactions, latestImportAt])

  if (transactions.length === 0) {
    return (
      <div className="hero rounded-box bg-base-100 py-16">
        <div className="hero-content flex-col text-center">
          <h1 className="text-2xl font-black">Nothing here yet</h1>
          <p className="max-w-md text-sm opacity-70">
            Import a bank statement and this page will show where your money went, broken down by
            category, with every Zelle payment and deposit listed by name.
          </p>
          <Link to="/import" className="btn btn-primary">Import a statement</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Overview</h1>
          <p className="text-sm opacity-70">
            {summary.count} transaction{summary.count === 1 ? '' : 's'}
            {month === 'all' ? ' in total' : ` in ${formatMonth(month)}`}
          </p>
        </div>
        <select
          className="select select-bordered select-sm"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
          aria-label="Period"
        >
          <option value="all">All months</option>
          {months.map((key) => (
            <option key={key} value={key}>{formatMonth(key)}</option>
          ))}
        </select>
      </header>

      <div className="stats stats-vertical bg-base-100 shadow sm:stats-horizontal">
        <div className="stat">
          <div className="stat-title">Money in</div>
          <div className="stat-value tabular text-2xl text-success">{formatMoney(summary.inflowCents)}</div>
          <div className="stat-desc">Transfers between your own accounts excluded</div>
        </div>
        <div className="stat">
          <div className="stat-title">Money out</div>
          <div className="stat-value tabular text-2xl text-error">{formatMoney(summary.outflowCents)}</div>
          <div className="stat-desc">{totals.length} categor{totals.length === 1 ? 'y' : 'ies'}</div>
        </div>
        <div className="stat">
          <div className="stat-title">Net</div>
          <div className={`stat-value tabular text-2xl ${summary.netCents < 0 ? 'text-error' : ''}`}>
            {formatMoney(summary.netCents)}
          </div>
          <div className="stat-desc">{summary.netCents < 0 ? 'Spent more than came in' : 'Came out ahead'}</div>
        </div>
      </div>

      <section className="card bg-base-100 shadow">
        <div className="card-body gap-4 p-4">
          <h2 className="card-title text-base">Where it went</h2>
          <CategoryBars totals={totals} />
        </div>
      </section>

      {newIncoming.length > 0 ? (
        <section className="card border border-primary/30 bg-base-100 shadow">
          <div className="card-body gap-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="card-title text-base">New since your last import</h2>
              <Link to="/income" className="link link-primary text-sm">See all</Link>
            </div>
            <ul className="divide-y divide-base-300">
              {newIncoming.map((txn) => (
                <li key={txn.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">
                      {txn.counterparty ?? txn.description}
                    </span>
                    <span className="block text-xs opacity-60">
                      {formatDate(txn.date)} · {txn.kind === 'zelle-in' ? 'Zelle' : 'Deposit'}
                    </span>
                  </span>
                  <span className="tabular whitespace-nowrap font-bold text-success">
                    {formatMoney(txn.amountCents, { sign: true })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  )
}

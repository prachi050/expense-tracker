import { useMemo, useState } from 'react'
import { formatDate, formatMonth, monthKey } from '../lib/dates'
import { formatMoney } from '../lib/money'
import { KIND_LABELS } from '../lib/income'
import { availableMonths, incomingTransactions } from '../lib/summary'
import { useStore } from '../state'

/**
 * Everything that put money into the account, with the sender's name where the
 * bank included one. This is the page the whole app was asked for.
 */
export default function IncomePage() {
  const { transactions, latestImportAt } = useStore()
  const [month, setMonth] = useState('all')
  const [onlyNew, setOnlyNew] = useState(false)
  const [onlyZelle, setOnlyZelle] = useState(false)

  const months = useMemo(() => availableMonths(transactions), [transactions])

  const rows = useMemo(() => {
    let list = incomingTransactions(transactions)
    if (month !== 'all') list = list.filter((txn) => monthKey(txn.date) === month)
    if (onlyZelle) list = list.filter((txn) => txn.kind === 'zelle-in')
    if (onlyNew && latestImportAt) list = list.filter((txn) => txn.importedAt === latestImportAt)
    return list.sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [transactions, month, onlyNew, onlyZelle, latestImportAt])

  const total = rows.reduce((sum, txn) => sum + txn.amountCents, 0)

  const bySender = useMemo(() => {
    const totals = new Map<string, { cents: number; count: number; last: string }>()
    for (const txn of rows) {
      if (!txn.counterparty) continue
      const current = totals.get(txn.counterparty) ?? { cents: 0, count: 0, last: txn.date }
      totals.set(txn.counterparty, {
        cents: current.cents + txn.amountCents,
        count: current.count + 1,
        last: txn.date > current.last ? txn.date : current.last,
      })
    }
    return [...totals.entries()].sort((a, b) => b[1].cents - a[1].cents).slice(0, 8)
  }, [rows])

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-black">Money coming in</h1>
        <p className="mt-1 text-sm opacity-70">
          Zelle payments and deposits, newest first, with the sender's name when the bank includes
          one in the description.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <select
          className="select select-bordered select-sm"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
          aria-label="Period"
        >
          <option value="all">All months</option>
          {months.map((key) => <option key={key} value={key}>{formatMonth(key)}</option>)}
        </select>
        <label className="label cursor-pointer gap-2">
          <input type="checkbox" className="toggle toggle-sm" checked={onlyZelle}
            onChange={(event) => setOnlyZelle(event.target.checked)} />
          <span className="label-text text-sm">Zelle only</span>
        </label>
        <label className="label cursor-pointer gap-2">
          <input type="checkbox" className="toggle toggle-sm" checked={onlyNew}
            disabled={!latestImportAt}
            onChange={(event) => setOnlyNew(event.target.checked)} />
          <span className="label-text text-sm">New since last import</span>
        </label>
        <span className="ml-auto tabular text-sm">
          {rows.length} item{rows.length === 1 ? '' : 's'} · <strong className="text-success">{formatMoney(total)}</strong>
        </span>
      </div>

      {bySender.length > 0 ? (
        <section className="card bg-base-100 shadow">
          <div className="card-body gap-3 p-4">
            <h2 className="card-title text-base">Who sent you money</h2>
            <div className="flex flex-wrap gap-2">
              {bySender.map(([name, info]) => (
                <div key={name} className="rounded-box bg-base-200 px-3 py-2">
                  <div className="font-semibold">{name}</div>
                  <div className="tabular text-sm text-success">{formatMoney(info.cents)}</div>
                  <div className="text-xs opacity-60">
                    {info.count} payment{info.count === 1 ? '' : 's'} · last {formatDate(info.last)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="card bg-base-100 shadow">
        <div className="card-body p-0">
          <div className="overflow-x-auto">
            <table className="table table-pin-rows">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>From</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((txn) => (
                  <tr key={txn.id} className={txn.importedAt === latestImportAt ? 'bg-primary/5' : ''}>
                    <td className="tabular whitespace-nowrap">{formatDate(txn.date)}</td>
                    <td className="font-semibold">
                      {txn.counterparty ?? <span className="opacity-50">Not named</span>}
                      {txn.importedAt === latestImportAt ? (
                        <span className="ml-2 badge badge-primary badge-xs align-middle">new</span>
                      ) : null}
                    </td>
                    <td><span className="badge badge-ghost badge-sm">{KIND_LABELS[txn.kind]}</span></td>
                    <td className="max-w-sm truncate text-xs opacity-70" title={txn.description}>
                      {txn.description}
                    </td>
                    <td className="tabular whitespace-nowrap text-right font-bold text-success">
                      {formatMoney(txn.amountCents, { sign: true })}
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
    </div>
  )
}

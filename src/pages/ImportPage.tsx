import { useCallback, useMemo, useState } from 'react'
import { parseCsv } from '../lib/csv'
import { detectColumns, type ColumnMap } from '../lib/columns'
import { detectDateOrder, type DateOrder } from '../lib/dates'
import { runImport } from '../lib/import'
import { formatMoney } from '../lib/money'
import { useStore } from '../state'
import type { ImportResult } from '../lib/types'

interface Staged {
  fileName: string
  rows: string[][]
  lineNumbers: number[]
  headers: string[]
  firstDataRow: number
  map: ColumnMap
  dateOrder: DateOrder
  dateOrderCertain: boolean
  positiveIsSpend: boolean
  notes: string[]
}

const ROLE_LABELS: Record<string, string> = {
  date: 'Date',
  description: 'Description',
  amount: 'Amount (one signed column)',
  debit: 'Money out',
  credit: 'Money in',
  balance: 'Balance',
}

function stage(fileName: string, content: string): Staged {
  const table = parseCsv(content)
  const detection = detectColumns(table.rows)
  const dataRows = table.rows.slice(detection.firstDataRow)
  const order = detectDateOrder(dataRows.map((row) => row[detection.map.date] ?? ''))

  // A file whose amounts are nearly all positive is almost certainly a credit
  // card export, where a positive number means a charge.
  let positives = 0
  let negatives = 0
  if (detection.map.amount !== null) {
    for (const row of dataRows.slice(0, 50)) {
      const raw = row[detection.map.amount] ?? ''
      if (/-|\(/.test(raw)) negatives += 1
      else if (/\d/.test(raw)) positives += 1
    }
  }

  return {
    fileName,
    rows: table.rows,
    lineNumbers: table.lineNumbers,
    headers: detection.headers,
    firstDataRow: detection.firstDataRow,
    map: detection.map,
    dateOrder: order.order,
    dateOrderCertain: order.certain,
    positiveIsSpend: negatives === 0 && positives > 3,
    notes: detection.notes,
  }
}

function runStaged(staged: Staged): ImportResult {
  const dataRows = staged.rows.slice(staged.firstDataRow)
  return runImport(dataRows, {
    map: staged.map,
    dateOrder: staged.dateOrder,
    positiveIsSpend: staged.positiveIsSpend,
    fileName: staged.fileName,
    importedAt: new Date().toISOString(),
    lineNumbers: staged.lineNumbers.slice(staged.firstDataRow),
  })
}

export default function ImportPage() {
  const { commitImport } = useStore()
  const [staged, setStaged] = useState<Staged | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const result = useMemo(() => (staged ? runStaged(staged) : null), [staged])

  const pick = useCallback(async () => {
    setFailure(null)
    setMessage(null)
    const files = await window.expenses.pickStatements()
    const usable = files.find((file) => typeof file.content === 'string')
    if (!usable || typeof usable.content !== 'string') {
      if (files.length > 0) setFailure(files[0].error ?? 'That file could not be read.')
      return
    }
    if (files.length > 1) {
      setMessage(`Showing ${usable.name}. Add it, then pick the next file.`)
    }
    setStaged(stage(usable.name, usable.content))
  }, [])

  const onDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault()
    setFailure(null)
    const file = event.dataTransfer.files[0]
    if (!file) return
    try {
      const path = window.expenses.pathForFile(file)
      const read = await window.expenses.readStatement(path)
      setStaged(stage(read.name, read.content))
    } catch (error) {
      setFailure((error as Error).message)
    }
  }, [])

  const update = (patch: Partial<Staged>) => setStaged((current) => (current ? { ...current, ...patch } : current))

  const setRole = (role: keyof ColumnMap, value: number | null) => {
    if (!staged) return
    update({ map: { ...staged.map, [role]: value } as ColumnMap })
  }

  const columnOptions = useMemo(() => {
    if (!staged) return []
    const width = Math.max(
      staged.headers.length,
      ...staged.rows.slice(staged.firstDataRow, staged.firstDataRow + 20).map((row) => row.length),
    )
    return Array.from({ length: width }, (_, index) => ({
      index,
      label: staged.headers[index]?.trim() || `Column ${index + 1}`,
    }))
  }, [staged])

  const add = async () => {
    if (!staged || !result) return
    setBusy(true)
    try {
      const outcome = await commitImport(result.transactions, {
        fileName: staged.fileName,
        errors: result.errors.length,
      })
      setMessage(
        `${staged.fileName}: added ${outcome.added}, skipped ${outcome.duplicates} already on file` +
          (result.errors.length > 0 ? `, ${result.errors.length} could not be read` : '') + '.',
      )
      setStaged(null)
    } catch (error) {
      setFailure((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-black">Import a statement</h1>
        <p className="mt-1 text-sm opacity-70">
          Files are read on this Mac and never sent anywhere. Check the preview before adding.
        </p>
      </header>

      {failure ? <div className="alert alert-error text-sm">{failure}</div> : null}
      {message ? <div className="alert alert-success text-sm">{message}</div> : null}

      <div
        onDrop={onDrop}
        onDragOver={(event) => event.preventDefault()}
        className="rounded-box border-2 border-dashed border-base-content/20 bg-base-100 p-8 text-center"
      >
        <p className="text-sm opacity-70">Drop a CSV statement here</p>
        <div className="divider text-xs opacity-50">or</div>
        <button type="button" className="btn btn-primary" onClick={pick}>
          Choose a file
        </button>
        <p className="mt-3 text-xs opacity-60">
          Export your statement as CSV from online banking. Chase, Bank of America, Wells Fargo,
          Capital One and Discover layouts are recognised automatically.
        </p>
      </div>

      {staged && result ? (
        <>
          <section className="card bg-base-100 shadow">
            <div className="card-body gap-4 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="card-title text-base">{staged.fileName}</h2>
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => setStaged(null)}>
                  Discard
                </button>
              </div>

              {staged.notes.map((note) => (
                <p key={note} className="text-xs opacity-70">{note}</p>
              ))}

              <div className="grid gap-3 sm:grid-cols-3">
                {(['date', 'description', 'amount', 'debit', 'credit', 'balance'] as const).map((role) => (
                  <label key={role} className="form-control">
                    <span className="label-text text-xs opacity-70">{ROLE_LABELS[role]}</span>
                    <select
                      className="select select-sm select-bordered"
                      value={String(staged.map[role] ?? -1)}
                      onChange={(event) => {
                        const value = Number(event.target.value)
                        if (role === 'date' || role === 'description') setRole(role, value)
                        else setRole(role, value === -1 ? null : value)
                      }}
                    >
                      <option value="-1">Not in this file</option>
                      {columnOptions.map((option) => (
                        <option key={option.index} value={option.index}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                ))}

                <label className="form-control">
                  <span className="label-text text-xs opacity-70">Day and month order</span>
                  <select
                    className={`select select-sm select-bordered ${staged.dateOrderCertain ? '' : 'select-warning'}`}
                    value={staged.dateOrder}
                    onChange={(event) => update({ dateOrder: event.target.value as DateOrder })}
                  >
                    <option value="mdy">Month / Day / Year</option>
                    <option value="dmy">Day / Month / Year</option>
                    <option value="ymd">Year / Month / Day</option>
                  </select>
                </label>

                <label className="form-control sm:col-span-2">
                  <span className="label-text text-xs opacity-70">Sign convention</span>
                  <label className="label cursor-pointer justify-start gap-3 py-1">
                    <input
                      type="checkbox"
                      className="toggle toggle-sm toggle-primary"
                      checked={staged.positiveIsSpend}
                      onChange={(event) => update({ positiveIsSpend: event.target.checked })}
                    />
                    <span className="label-text text-sm">
                      A positive number means money spent (usual for credit cards)
                    </span>
                  </label>
                </label>
              </div>

              {!staged.dateOrderCertain ? (
                <div className="alert alert-warning py-2 text-xs">
                  Every date in this file has a day of 12 or lower, so the order cannot be told
                  from the data. Check it matches your bank before adding.
                </div>
              ) : null}
            </div>
          </section>

          <section className="card bg-base-100 shadow">
            <div className="card-body gap-3 p-4">
              <h2 className="card-title text-base">Check the numbers</h2>
              <div className="stats stats-vertical sm:stats-horizontal bg-base-200">
                <div className="stat py-3">
                  <div className="stat-title text-xs">Rows in file</div>
                  <div className="stat-value text-2xl tabular">{result.dataRowCount}</div>
                </div>
                <div className="stat py-3">
                  <div className="stat-title text-xs">Read successfully</div>
                  <div className="stat-value text-2xl tabular">{result.transactions.length}</div>
                </div>
                <div className="stat py-3">
                  <div className="stat-title text-xs">Could not read</div>
                  <div className={`stat-value text-2xl tabular ${result.errors.length > 0 ? 'text-warning' : ''}`}>
                    {result.errors.length}
                  </div>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-box bg-base-200 p-3">
                  <div className="text-xs opacity-70">Money in</div>
                  <div className="tabular text-lg font-bold text-success">{formatMoney(result.inflowCents)}</div>
                </div>
                <div className="rounded-box bg-base-200 p-3">
                  <div className="text-xs opacity-70">Money out</div>
                  <div className="tabular text-lg font-bold text-error">{formatMoney(result.outflowCents)}</div>
                </div>
                <div className="rounded-box bg-base-200 p-3">
                  <div className="text-xs opacity-70">Net</div>
                  <div className="tabular text-lg font-bold">{formatMoney(result.netCents)}</div>
                </div>
              </div>
              <p className="text-xs opacity-60">
                Compare these with the totals printed on your statement. If they differ, the
                column mapping or the sign convention above is wrong.
              </p>
            </div>
          </section>

          {result.errors.length > 0 ? (
            <section className="card border border-warning/40 bg-base-100 shadow">
              <div className="card-body gap-2 p-4">
                <h2 className="card-title text-base text-warning">
                  {result.errors.length} row{result.errors.length === 1 ? '' : 's'} could not be read
                </h2>
                <p className="text-xs opacity-70">
                  These are listed rather than skipped quietly. Line numbers refer to the original file.
                </p>
                <div className="max-h-56 overflow-auto">
                  <table className="table table-xs">
                    <thead><tr><th>Line</th><th>Why</th><th>Row</th></tr></thead>
                    <tbody>
                      {result.errors.slice(0, 50).map((rowError) => (
                        <tr key={`${rowError.line}-${rowError.reason}`}>
                          <td className="tabular">{rowError.line}</td>
                          <td>{rowError.reason}</td>
                          <td className="max-w-md truncate opacity-70">{rowError.raw.join(' | ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ) : null}

          <section className="card bg-base-100 shadow">
            <div className="card-body gap-2 p-4">
              <h2 className="card-title text-base">First rows as they will be saved</h2>
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead><tr><th>Date</th><th>Description</th><th>Category</th><th className="text-right">Amount</th></tr></thead>
                  <tbody>
                    {result.transactions.slice(0, 8).map((txn) => (
                      <tr key={txn.id}>
                        <td className="tabular whitespace-nowrap">{txn.date}</td>
                        <td className="max-w-sm truncate">{txn.description}</td>
                        <td><span className="badge badge-ghost badge-sm">{txn.category}</span></td>
                        <td className={`tabular text-right ${txn.amountCents < 0 ? '' : 'text-success'}`}>
                          {formatMoney(txn.amountCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <button
            type="button"
            className="btn btn-primary btn-wide self-start"
            disabled={busy || result.transactions.length === 0}
            onClick={add}
          >
            {busy ? 'Adding…' : `Add ${result.transactions.length} transactions`}
          </button>
        </>
      ) : null}
    </div>
  )
}

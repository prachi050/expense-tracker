import { useCallback, useMemo, useState } from 'react'
import { parseCsv } from '../lib/csv'
import { buildTable, type OcrDocument, type StatementTotal } from '../lib/pdfRows'
import { detectColumns, type ColumnMap } from '../lib/columns'
import { detectDateOrder, type DateOrder } from '../lib/dates'
import { runImport } from '../lib/import'
import { formatMoney, parseMoney } from '../lib/money'
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
  /** Present when the statement was read from a PDF. */
  scan?: {
    pages: number
    readBy: 'ocr' | 'text-layer'
    lowestConfidence: number
    totals: StatementTotal[]
    ignored: string[]
  }
}

const ROLE_LABELS: Record<string, string> = {
  date: 'Date',
  description: 'Description',
  amount: 'Amount (one signed column)',
  debit: 'Money out',
  credit: 'Money in',
  balance: 'Balance',
}

function stagePdf(fileName: string, recognised: string): Staged {
  const document = JSON.parse(recognised) as OcrDocument
  const table = buildTable(document)
  const detection = detectColumns(table.rows)
  const dataRows = table.rows.slice(detection.firstDataRow)
  const order = detectDateOrder(dataRows.map((row) => row[detection.map.date] ?? ''))

  return {
    fileName,
    rows: table.rows,
    lineNumbers: table.pages,
    headers: detection.headers,
    firstDataRow: detection.firstDataRow,
    map: detection.map,
    dateOrder: order.order,
    dateOrderCertain: order.certain,
    // Signs come from the statement's own sections, already applied.
    positiveIsSpend: false,
    notes: detection.notes,
    scan: {
      pages: document.pages,
      readBy: document.source,
      lowestConfidence: table.lowestConfidence,
      totals: table.totals.filter((total) => total.text !== ''),
      ignored: table.ignored,
    },
  }
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

function runStaged(staged: Staged, mask: boolean): ImportResult {
  const dataRows = staged.rows.slice(staged.firstDataRow)
  return runImport(dataRows, {
    map: staged.map,
    dateOrder: staged.dateOrder,
    positiveIsSpend: staged.positiveIsSpend,
    fileName: staged.fileName,
    importedAt: new Date().toISOString(),
    lineNumbers: staged.lineNumbers.slice(staged.firstDataRow),
    maskAccountNumbers: mask,
  })
}

export default function ImportPage() {
  const { commitImport, settings } = useStore()
  const [staged, setStaged] = useState<Staged | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const result = useMemo(
    () => (staged ? runStaged(staged, settings.maskAccountNumbers) : null),
    [staged, settings.maskAccountNumbers],
  )

  /** The money-out subtotals the statement prints, added together. */
  const printedOutflow = useMemo(() => {
    if (!staged?.scan) return 0
    let total = 0
    for (const entry of staged.scan.totals) {
      if (/deposit|addition/i.test(entry.label)) continue
      try { total += Math.abs(parseMoney(entry.text).cents) } catch { /* not a figure */ }
    }
    return total
  }, [staged])

  const pick = useCallback(async () => {
    setFailure(null)
    setMessage(null)
    setBusy(true)
    try {
      const files = await window.expenses.pickStatements()
      const usable = files.find((file) => typeof file.content === 'string')
      if (!usable || typeof usable.content !== 'string') {
        if (files.length > 0) setFailure(files[0].error ?? 'That file could not be read.')
        return
      }
      if (files.length > 1) {
        setMessage(`Showing ${usable.name}. Add it, then pick the next file.`)
      }
      setStaged(
        usable.kind === 'pdf'
          ? stagePdf(usable.name, usable.content)
          : stage(usable.name, usable.content),
      )
    } catch (error) {
      setFailure((error as Error).message)
    } finally {
      setBusy(false)
    }
  }, [])

  const onDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault()
    setFailure(null)
    const file = event.dataTransfer.files[0]
    if (!file) return
    setBusy(true)
    try {
      const path = window.expenses.pathForFile(file)
      const read = await window.expenses.readStatement(path)
      if (typeof read.content !== 'string') throw new Error('That file could not be read.')
      setStaged(
        read.kind === 'pdf' ? stagePdf(read.name, read.content) : stage(read.name, read.content),
      )
    } catch (error) {
      setFailure((error as Error).message)
    } finally {
      setBusy(false)
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
        <p className="text-sm opacity-70">Drop a statement here</p>
        <div className="divider text-xs opacity-50">or</div>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={pick}>
          {busy ? 'Reading…' : 'Choose a file'}
        </button>
        <p className="mt-3 text-xs opacity-60">
          PDF or CSV. A scanned or screenshotted PDF is read on this Mac using the built-in macOS
          text recogniser, which takes a few seconds per page and never goes online.
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

              {staged.scan ? (
                <div className="alert alert-info py-2 text-xs">
                  {staged.scan.readBy === 'ocr' ? (
                    <span>
                      Read from {staged.scan.pages} scanned page
                      {staged.scan.pages === 1 ? '' : 's'} using the macOS text recogniser, on this
                      Mac. Recognised text can contain mistakes, so check the totals below before
                      adding. {staged.scan.ignored.length} line
                      {staged.scan.ignored.length === 1 ? '' : 's'} were page headings or footers
                      and are not transactions.
                    </span>
                  ) : (
                    <span>Read from the text embedded in {staged.scan.pages} PDF pages.</span>
                  )}
                </div>
              ) : null}
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
              {staged.scan && staged.scan.totals.length > 0 ? (
                <div className="rounded-box border border-base-300 p-3">
                  <h3 className="text-sm font-bold">Checked against your statement's own totals</h3>
                  <table className="table table-xs mt-2">
                    <tbody>
                      {staged.scan.totals.map((total) => {
                        let printed: number | null = null
                        try { printed = Math.abs(parseMoney(total.text).cents) } catch { printed = null }
                        const wantsDeposits = /deposit|addition/i.test(total.label)
                        const mine = Math.abs(
                          result.transactions
                            .filter((txn) => (wantsDeposits ? txn.amountCents > 0 : txn.amountCents < 0))
                            .reduce((sum, txn) => sum + txn.amountCents, 0),
                        )
                        // Only a whole-side total can be compared directly; a
                        // subtotal is one part of that side.
                        const comparable = /^total (deposits|withdrawals)/i.test(total.label)
                        const agrees = printed !== null && printed === mine
                        return (
                          <tr key={total.label}>
                            <td>{total.label}</td>
                            <td className="tabular text-right">{total.text}</td>
                            <td className="text-right">
                              {printed === null ? (
                                <span className="opacity-50">not a figure</span>
                              ) : !comparable ? (
                                <span className="opacity-60">part of the total below</span>
                              ) : agrees ? (
                                <span className="badge badge-success badge-sm">matches exactly</span>
                              ) : (
                                <span className="badge badge-error badge-sm">
                                  off by {formatMoney(Math.abs(printed - mine))}
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                      <tr className="border-t border-base-300">
                        <td className="font-semibold">Subtotals printed for money out, added up</td>
                        <td className="tabular text-right font-semibold">
                          {formatMoney(printedOutflow)}
                        </td>
                        <td className="text-right">
                          {printedOutflow === Math.abs(result.outflowCents) ? (
                            <span className="badge badge-success badge-sm">matches exactly</span>
                          ) : (
                            <span className="badge badge-error badge-sm">
                              off by {formatMoney(Math.abs(printedOutflow - Math.abs(result.outflowCents)))}
                            </span>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs opacity-60">
                  Compare these with the totals printed on your statement. If they differ, the
                  column mapping or the sign convention above is wrong.
                </p>
              )}
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

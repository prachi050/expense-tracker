import { useEffect, useRef, useState } from 'react'
import { formatDate } from '../lib/dates'
import { containsAccountNumber } from '../lib/redact'
import { toCsv } from '../lib/storage'
import { useStore } from '../state'

export default function SettingsPage() {
  const { transactions, rules, batches, settings, setSetting, scrubStoredAccountNumbers, removeRule, eraseEverything } = useStore()
  const [location, setLocation] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const confirmErase = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    window.expenses.dataLocation().then(setLocation).catch(() => setLocation(''))
  }, [])

  const storedWithNumbers = transactions.filter((txn) => containsAccountNumber(txn.description)).length

  const exportAll = async () => {
    const result = await window.expenses.exportCsv('transactions.csv', toCsv(transactions))
    setNote(result.saved ? `Exported to ${result.path}` : null)
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-black">Settings</h1>
      </header>

      {note ? <div className="alert alert-success text-sm">{note}</div> : null}

      <section className="card bg-base-100 shadow">
        <div className="card-body gap-3 p-4">
          <h2 className="card-title text-base">Privacy</h2>
          <label className="label cursor-pointer justify-start gap-3">
            <input
              type="checkbox"
              className="toggle toggle-primary"
              checked={settings.maskAccountNumbers}
              onChange={(event) => setSetting('maskAccountNumbers', event.target.checked)}
            />
            <span className="label-text">
              Remove account numbers from descriptions when importing
            </span>
          </label>
          <p className="text-xs opacity-70">
            Banks sometimes write an account or card number into the description. With this on,
            runs of seven or more digits are replaced by the last four before anything is saved,
            so the full number never reaches the disk. Shorter numbers, such as a store number,
            are left alone because they help you recognise a transaction.
          </p>
          {storedWithNumbers > 0 ? (
            <div className="alert alert-warning py-2">
              <div className="text-sm">
                <strong>{storedWithNumbers}</strong> saved
                {storedWithNumbers === 1 ? ' description still has' : ' descriptions still have'} a
                full number in the text, from an import made with this switched off.
                <button type="button" className="btn btn-sm btn-warning ml-3"
                  onClick={async () => {
                    const changed = await scrubStoredAccountNumbers()
                    setNote(`Removed account numbers from ${changed} description${changed === 1 ? '' : 's'}.`)
                  }}>
                  Remove them now
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-success">
              No saved description contains a full account number.
            </p>
          )}
        </div>
      </section>

      <section className="card bg-base-100 shadow">
        <div className="card-body gap-3 p-4">
          <h2 className="card-title text-base">Your data</h2>
          <p className="text-sm opacity-75">
            Everything lives in one file on this Mac, readable only by your own account. The app
            makes no network requests, so nothing is uploaded, synced or shared.
          </p>
          <code className="block overflow-x-auto rounded bg-base-200 p-2 text-xs">{location || '…'}</code>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-sm" onClick={() => window.expenses.revealData()}>
              Show in Finder
            </button>
            <button type="button" className="btn btn-sm" onClick={exportAll}
              disabled={transactions.length === 0}>
              Export all as CSV
            </button>
            <button type="button" className="btn btn-sm btn-outline btn-error"
              onClick={() => confirmErase.current?.showModal()}
              disabled={transactions.length === 0}>
              Erase everything
            </button>
          </div>
          <p className="text-xs opacity-60">
            A copy of the previous version is kept beside it as expenses.backup.json each time it saves.
          </p>
        </div>
      </section>

      <section className="card bg-base-100 shadow">
        <div className="card-body gap-3 p-4">
          <h2 className="card-title text-base">Your categorisation rules</h2>
          {rules.length === 0 ? (
            <p className="text-sm opacity-70">
              None yet. Use the Rule button beside any transaction to create one.
            </p>
          ) : (
            <ul className="divide-y divide-base-300">
              {rules.map((rule) => (
                <li key={rule.pattern} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <code className="text-sm">{rule.pattern}</code>
                    <span className="ml-2 badge badge-ghost badge-sm">{rule.category}</span>
                  </span>
                  <button type="button" className="btn btn-ghost btn-xs"
                    onClick={() => removeRule(rule.pattern)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="card bg-base-100 shadow">
        <div className="card-body gap-3 p-4">
          <h2 className="card-title text-base">Import history</h2>
          {batches.length === 0 ? (
            <p className="text-sm opacity-70">No statements imported yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead><tr><th>When</th><th>File</th><th>Added</th><th>Duplicates</th><th>Unreadable</th></tr></thead>
                <tbody>
                  {batches.slice(0, 20).map((batch) => (
                    <tr key={batch.id}>
                      <td className="whitespace-nowrap">{formatDate(batch.importedAt.slice(0, 10))}</td>
                      <td className="max-w-xs truncate">{batch.fileName}</td>
                      <td className="tabular">{batch.added}</td>
                      <td className="tabular opacity-70">{batch.duplicates}</td>
                      <td className={`tabular ${batch.errors > 0 ? 'text-warning' : 'opacity-70'}`}>{batch.errors}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <dialog ref={confirmErase} className="modal">
        <div className="modal-box">
          <h3 className="text-lg font-bold">Erase all your data?</h3>
          <p className="py-3 text-sm opacity-75">
            This removes every transaction, rule and import record from this Mac. It cannot be
            undone. Export first if you want a copy.
          </p>
          <div className="modal-action">
            <form method="dialog" className="flex gap-2">
              <button type="submit" className="btn btn-ghost">Keep it</button>
              <button type="submit" className="btn btn-error"
                onClick={() => { void eraseEverything(); setNote('All data erased.') }}>
                Erase everything
              </button>
            </form>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop"><button type="submit">close</button></form>
      </dialog>
    </div>
  )
}

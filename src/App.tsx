import { useMemo } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useStore } from './state'

const LINKS = [
  { to: '/', label: 'Overview', end: true },
  { to: '/income', label: 'Money in' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/tidy', label: 'Needs a category' },
  { to: '/import', label: 'Import' },
  { to: '/settings', label: 'Settings' },
]

export default function App() {
  const { status, error, transactions } = useStore()

  const needingCategory = useMemo(
    () =>
      transactions.filter(
        (txn) =>
          txn.categorySource !== 'user' &&
          (txn.category === 'Uncategorized' || txn.ruleConfidence === 'low'),
      ).length,
    [transactions],
  )

  return (
    <div className="flex h-full flex-col bg-base-200">
      <div className="drag-region h-7 w-full bg-base-300" />

      <div className="flex min-h-0 flex-1">
        <aside className="no-drag flex w-52 flex-col gap-1 border-r border-base-300 bg-base-100 p-3">
          <div className="px-2 pb-3">
            <div className="text-sm font-black">Expense Tracker</div>
            <div className="text-xs opacity-60">
              {transactions.length} transaction{transactions.length === 1 ? '' : 's'}
            </div>
          </div>
          <nav>
            <ul className="menu w-full gap-1 p-0">
              {LINKS.map((link) => (
                <li key={link.to}>
                  <NavLink
                    to={link.to}
                    end={link.end}
                    className={({ isActive }) => (isActive ? 'active font-semibold' : '')}
                  >
                    <span className="flex-1">{link.label}</span>
                    {link.to === '/tidy' && needingCategory > 0 ? (
                      <span className="badge badge-warning badge-sm">{needingCategory}</span>
                    ) : null}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-auto px-2 text-xs opacity-50">
            Stays on this Mac. No network.
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          {status === 'loading' ? (
            <div className="flex h-full items-center justify-center">
              <span className="loading loading-spinner loading-lg" />
            </div>
          ) : status === 'error' ? (
            <div className="alert alert-error">
              <div>
                <h2 className="font-bold">Your saved data could not be read</h2>
                <p className="text-sm">{error}</p>
                <p className="mt-2 text-sm">
                  Nothing has been changed or overwritten. A backup copy sits beside it as
                  expenses.backup.json.
                </p>
              </div>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  )
}

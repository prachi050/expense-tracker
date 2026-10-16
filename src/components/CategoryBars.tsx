import { useState } from 'react'
import { formatMoney } from '../lib/money'

export interface CategoryTotal {
  category: string
  cents: number
}

/**
 * Spending by category: a magnitude comparison, so horizontal bars sorted
 * largest first. One hue throughout, because the category name on each row
 * carries the identity and colour would be decoration. Every bar is directly
 * labelled with its value, so nothing depends on reading the axis.
 */
export function CategoryBars({ totals, max }: { totals: CategoryTotal[]; max?: number }) {
  const [hovered, setHovered] = useState<string | null>(null)
  if (totals.length === 0) {
    return <p className="py-8 text-center text-sm opacity-60">Nothing to show for this period.</p>
  }

  const ceiling = max ?? Math.max(...totals.map((total) => Math.abs(total.cents)), 1)
  const grandTotal = totals.reduce((sum, total) => sum + Math.abs(total.cents), 0)

  return (
    <ul className="flex flex-col gap-2">
      {totals.map((total) => {
        const magnitude = Math.abs(total.cents)
        const width = Math.max(1, (magnitude / ceiling) * 100)
        const share = grandTotal === 0 ? 0 : Math.round((magnitude / grandTotal) * 100)
        const active = hovered === total.category

        return (
          <li
            key={total.category}
            className="grid grid-cols-[10rem_1fr_auto] items-center gap-3 rounded px-1 py-0.5"
            onMouseEnter={() => setHovered(total.category)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="truncate text-sm" title={total.category}>
              {total.category}
            </span>
            <span className="relative block h-5 rounded bg-base-300/60">
              <span
                className="absolute inset-y-0 left-0 rounded transition-[width] duration-300"
                style={{
                  width: `${width}%`,
                  backgroundColor: 'var(--viz-series-1)',
                  opacity: active ? 1 : 0.88,
                }}
              />
              {active ? (
                <span className="absolute -top-8 left-0 z-10 whitespace-nowrap rounded bg-neutral px-2 py-1 text-xs text-neutral-content shadow">
                  {total.category}: {formatMoney(magnitude)} · {share}% of the total
                </span>
              ) : null}
            </span>
            <span className="tabular text-sm font-semibold">{formatMoney(magnitude)}</span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Turns recognised text into statement rows.
 *
 * A scanned statement is laid out in columns, and the recogniser returns each
 * column as its own block, so the text alone is useless: dates arrive in one
 * run and descriptions in another. What makes it recoverable is position.
 * Every line carries where it sat on the page, so rows are rebuilt by matching
 * vertical position and columns by horizontal position.
 */

export interface OcrLine {
  page: number
  text: string
  confidence: number
  x: number
  y: number
  width: number
  height: number
}

export interface OcrDocument {
  pages: number
  source: 'ocr' | 'text-layer'
  lines: OcrLine[]
}

export interface StatementTotal {
  label: string
  /** As printed, before any interpretation. */
  text: string
}

export interface PdfTable {
  /** A header row followed by data rows, matching what the CSV path produces. */
  rows: string[][]
  /** 1-based line numbers are meaningless here, so rows map to page numbers. */
  pages: number[]
  /** "Total ..." lines the statement prints, for checking the arithmetic. */
  totals: StatementTotal[]
  /** Lines that were not part of any row, kept so nothing is invisible. */
  ignored: string[]
  lowestConfidence: number
}

/** Rows sit about 0.026 of the page apart, so half of that separates them. */
const ROW_TOLERANCE = 0.012

const DATE_COLUMN_MAX_X = 0.12
const AMOUNT_COLUMN_MIN_X = 0.80
/**
 * Section headings sit further left than the description column. This must
 * stay well clear of it: a description such as "CHECKCARD ... SERV FEE ..."
 * contains a word a heading would contain, and treating it as one both loses
 * the row and flips the sign of everything below it.
 */
const HEADING_MAX_X = 0.10

const DATE_CELL = /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/
const MONEY_CELL = /^-?\$?\d{1,3}(,\d{3})*\.\d{2}$|^-?\$?\d+\.\d{2}$/
const TOTAL_LINE = /^total\b/i

/** Headings that tell us whether an unsigned amount is money in or money out. */
function sectionPolarity(heading: string): 1 | -1 | 0 {
  const text = heading.toLowerCase()
  if (text.includes('deposit') || text.includes('addition')) return 1
  if (text.includes('withdrawal') || text.includes('subtraction')) return -1
  if (text.includes('fee') || text.includes('charge')) return -1
  return 0
}

function isHeading(line: OcrLine): boolean {
  return (
    line.x < HEADING_MAX_X &&
    line.text.length > 6 &&
    !DATE_CELL.test(line.text) &&
    sectionPolarity(line.text) !== 0
  )
}

export function buildTable(document: OcrDocument): PdfTable {
  const rows: string[][] = []
  const pages: number[] = []
  const totals: StatementTotal[] = []
  const ignored: string[] = []
  /** Lets a wrapped description find the row it belongs to. */
  const rowIndexByKey = new Map<string, number>()
  let lowestConfidence = 1

  for (let page = 1; page <= document.pages; page += 1) {
    const lines = document.lines
      .filter((line) => line.page === page)
      .sort((a, b) => a.y - b.y)

    // Which section of the statement each vertical position falls in.
    let polarity: 1 | -1 | 0 = 0

    const dates: OcrLine[] = []
    const descriptions: OcrLine[] = []
    const amounts: OcrLine[] = []

    for (const line of lines) {
      const text = line.text.trim()
      if (text === '') continue

      // Checked before the heading test: "Total deposits and other additions"
      // satisfies both, and it is a total, not the start of a new section.
      if (TOTAL_LINE.test(text)) {
        // The amount for a total sits on the same row, to the right.
        const sameRow = lines.find(
          (other) => other.x >= AMOUNT_COLUMN_MIN_X && Math.abs(other.y - line.y) < ROW_TOLERANCE,
        )
        totals.push({ label: text, text: sameRow?.text.trim() ?? '' })
        continue
      }

      if (isHeading(line)) {
        polarity = sectionPolarity(text)
        ignored.push(`p${page}: ${text}`)
        continue
      }

      if (line.x < DATE_COLUMN_MAX_X && DATE_CELL.test(text)) {
        dates.push({ ...line, text })
      } else if (line.x >= AMOUNT_COLUMN_MIN_X && MONEY_CELL.test(text.replace(/\s/g, ''))) {
        amounts.push({ ...line, text: text.replace(/\s/g, '') })
        // Remember the polarity in force where this amount appeared.
        ;(amounts[amounts.length - 1] as OcrLine & { polarity?: number }).polarity = polarity
      } else if (line.x >= DATE_COLUMN_MAX_X && line.x < AMOUNT_COLUMN_MIN_X) {
        descriptions.push({ ...line, text })
      } else {
        ignored.push(`p${page}: ${text}`)
      }
    }

    // A row exists wherever there is a date. Everything else joins the row it
    // is vertically closest to.
    for (const date of dates) {
      const description = nearest(descriptions, date.y)
      const amount = nearest(amounts, date.y)
      if (!description || !amount) {
        ignored.push(`p${page}: ${date.text} (no matching ${!description ? 'description' : 'amount'})`)
        continue
      }

      lowestConfidence = Math.min(lowestConfidence, date.confidence, description.confidence, amount.confidence)

      let value = amount.text
      // An unsigned amount takes its sign from the section it sits under.
      const polarityForAmount = (amount as OcrLine & { polarity?: number }).polarity ?? 0
      if (!value.startsWith('-') && polarityForAmount === -1) value = `-${value}`

      rowIndexByKey.set(`${page}:${date.y}`, rows.length)
      rows.push([date.text, description.text, value])
      pages.push(page)
    }

    // A wrapped description produces an extra line below its row. Append it
    // to the row above rather than discarding it.
    for (const leftover of descriptions) {
      if (dates.some((date) => Math.abs(date.y - leftover.y) < ROW_TOLERANCE)) continue

      const above = dates
        .filter((date) => date.y < leftover.y)
        .sort((a, b) => b.y - a.y)[0]
      const rowIndex = above ? rowIndexByKey.get(`${page}:${above.y}`) : undefined

      // Only a line close below its row is a continuation; anything else is
      // page furniture and is reported instead.
      if (rowIndex !== undefined && leftover.y - above!.y < ROW_TOLERANCE * 2.5) {
        rows[rowIndex][1] = `${rows[rowIndex][1]} ${leftover.text}`.trim()
      } else {
        ignored.push(`p${page}: ${leftover.text}`)
      }
    }
  }

  return {
    rows: [['Date', 'Description', 'Amount'], ...rows],
    pages: [0, ...pages],
    totals,
    ignored,
    lowestConfidence,
  }
}

function nearest(candidates: OcrLine[], y: number): OcrLine | undefined {
  let best: OcrLine | undefined
  let bestDistance = ROW_TOLERANCE
  for (const candidate of candidates) {
    const distance = Math.abs(candidate.y - y)
    if (distance < bestDistance) {
      bestDistance = distance
      best = candidate
    }
  }
  return best
}

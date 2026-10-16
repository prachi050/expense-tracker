/**
 * A CSV reader that follows RFC 4180: quoted fields may contain the delimiter,
 * newlines and doubled quotes. Hand-rolled so the app has no parsing
 * dependency and no surprises about how a field is split.
 */

export interface CsvTable {
  rows: string[][]
  /** 1-based line number in the source file for each row in `rows`. */
  lineNumbers: number[]
  delimiter: string
}

const CANDIDATE_DELIMITERS = [',', ';', '\t', '|'] as const

/**
 * Pick the delimiter that yields the most consistent column count across the
 * first few lines. Counting only unquoted occurrences keeps a comma inside
 * "SMITH, JOHN" from voting for itself.
 */
export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 20).filter((line) => line.trim() !== '')
  if (sample.length === 0) return ','

  let best = ','
  let bestScore = -1

  for (const delimiter of CANDIDATE_DELIMITERS) {
    const counts = sample.map((line) => countUnquoted(line, delimiter))
    const max = Math.max(...counts)
    if (max === 0) continue
    // Reward many columns, punish rows that disagree about how many.
    const mode = counts.sort((a, b) => a - b)[Math.floor(counts.length / 2)]
    const agreement = counts.filter((count) => count === mode).length / counts.length
    const score = mode * agreement
    if (score > bestScore) {
      bestScore = score
      best = delimiter
    }
  }
  return best
}

function countUnquoted(line: string, delimiter: string): number {
  let inQuotes = false
  let count = 0
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') i += 1
      else inQuotes = !inQuotes
    } else if (char === delimiter && !inQuotes) {
      count += 1
    }
  }
  return count
}

export function parseCsv(input: string, delimiter?: string): CsvTable {
  // Strip a UTF-8 byte order mark; Excel exports add one and it would
  // otherwise become part of the first header name.
  const text = input.replace(/^﻿/, '')
  const sep = delimiter ?? detectDelimiter(text)

  const rows: string[][] = []
  const lineNumbers: number[] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  // Tracked separately from the row index because blank lines are dropped and
  // a quoted field may itself span several lines.
  let line = 1
  let rowStartLine = 1

  const endField = () => {
    row.push(field)
    field = ''
  }
  const endRow = () => {
    endField()
    // Drop rows that are entirely empty, which trailing newlines create.
    if (row.some((value) => value.trim() !== '')) {
      rows.push(row)
      lineNumbers.push(rowStartLine)
    }
    row = []
    rowStartLine = line
  }

  while (i < text.length) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      if (char === '\n') line += 1
      field += char
      i += 1
      continue
    }

    if (char === '"' && field.trim() === '') {
      // Opening quote; discard any whitespace that preceded it.
      field = ''
      inQuotes = true
      i += 1
      continue
    }
    if (char === sep) {
      endField()
      i += 1
      continue
    }
    if (char === '\r') {
      i += 1
      continue
    }
    if (char === '\n') {
      line += 1
      endRow()
      i += 1
      continue
    }
    field += char
    i += 1
  }

  if (field !== '' || row.length > 0) endRow()

  return {
    rows: rows.map((cells) => cells.map((cell) => cell.trim())),
    lineNumbers,
    delimiter: sep,
  }
}

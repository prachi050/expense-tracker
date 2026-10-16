# Expense Tracker

A desktop app for macOS that turns bank statement exports into a picture of
where your money goes, and lists every Zelle payment and deposit by name and
date.

It is for one person on one Mac. There are no accounts, no sync and no server.

## What is exact, and what is a guess

This distinction matters, so the app is built around it.

**Exact.** Amounts are parsed into whole cents and every total is integer
arithmetic, so there is no rounding drift. Every row in a file is accounted
for: it either imports or appears in a list of rows that could not be read,
with the line number from the original file. Re-importing an overlapping
statement adds nothing twice, while two genuinely identical purchases on the
same day are both kept.

**A guess.** The category. It is keyword matching, so it will be wrong
sometimes. Every category is a dropdown you can change, your change is never
overwritten, and anything the app was unsure about is flagged with a warning
colour and a "needs a look" filter.

Before anything is saved, the import screen shows money in, money out and the
net, so you can check them against the totals printed on your statement.

## Safety

- No network code. The Content-Security-Policy sets `connect-src 'none'`, and a
  test asserts that an outbound request fails.
- The interface runs sandboxed with no access to Node or the file system. The
  only way it touches a file is through named operations in `electron/preload.cjs`.
- Navigating away from the app and opening new windows are both refused.
- All permission requests (camera, location and the rest) are denied.
- Data lives in one JSON file under Application Support, written with
  owner-only permissions (0600), as are backups and exports. Saves write to a
  temporary file and rename, and keep the previous version as a backup, so an
  interrupted save cannot leave a half-written file.

### What is kept from a statement

Only the date, description, amount and running balance are stored. Columns
such as "Card No." or "Account Number" are never imported, even when the file
has them.

Descriptions are kept exactly as the bank wrote them, so if a description
itself contains an account number, for example `ONLINE TRANSFER TO ACCT
987654321098`, that text is stored. The file is not encrypted, so it is
protected by your Mac account and by FileVault if you have it on.
- If that file ever cannot be read, the app shows an error instead of starting
  empty, because starting empty would overwrite it on the next save.

Reading a PDF needs the two small Swift programs in `native/`, built by
`npm run build:native` and bundled into the packaged app. They use only macOS
frameworks.

## Running it

```bash
npm install
npm start
```

`npm run dev` runs it with hot reload. `npm run package` builds
`release/mac-arm64/Expense Tracker.app`, and `npm run dmg` builds an installer.

## Tests

```bash
npm run test:all
```

- `scripts/test-core.ts` covers money, CSV and date parsing, including the
  floating point case that integer cents exist to avoid.
- `scripts/test-import.ts` covers the import pipeline against Chase, Bank of
  America, Wells Fargo and Capital One layouts, plus error reporting and
  duplicate handling.
- `scripts/e2e.mjs` starts the real app and drives it over the DevTools
  protocol: data round trips through disk unchanged, the sandbox holds,
  navigation is blocked and outbound requests fail.
- `scripts/test-pdfrows.ts` covers rebuilding rows from recognised text, using
  invented figures in a scanned statement's layout.
- `scripts/test-pdf-e2e.ts` generates a fake scanned statement, reads it back
  through the real recogniser, and checks the result against the totals that
  fixture prints.
- `scripts/smoke.cjs` loads the production bundle under the real
  Content-Security-Policy and reports anything the renderer logged.

## Statement formats

**CSV** exported from online banking. Chase, Bank of America, Wells Fargo,
Capital One and Discover layouts are recognised automatically, including files
with summary lines above the header and Wells Fargo files with no header at
all.

**PDF**, including a statement that is only screenshots or a scan. Pages are
read on this Mac with the system text recogniser, which needs no network. A
PDF that already carries real text uses that instead, since it is exact.

A scanned statement is laid out in columns, and the recogniser hands back each
column as a separate block, so the text alone cannot say which date belongs to
which amount. Rows are rebuilt from position: vertical position groups a row,
horizontal position says which column a cell is. Unsigned amounts take their
sign from the section heading they sit under.

Because recognition can misread, the import screen compares the rebuilt rows
against the totals the statement prints for itself and says whether they match
to the cent. That is a check against the bank's own arithmetic, not against
the app's.

Anything it cannot work out is shown as dropdowns on the import screen so you
can set the columns, the day/month order and the sign convention yourself.

## How it is put together

| Path | What lives there |
| --- | --- |
| `src/lib/money.ts` | Integer cents. Nothing else touches money. |
| `src/lib/csv.ts` | RFC 4180 reader that tracks real file line numbers. |
| `src/lib/dates.ts` | Date parsing; day/month order decided per column, not per row. |
| `src/lib/columns.ts` | Works out which column is which. |
| `src/lib/import.ts` | Normalising, error collection, duplicate detection. |
| `src/lib/categorize.ts` | Keyword rules and your own overrides. |
| `src/lib/income.ts` | Zelle and deposit detection, sender name extraction. |
| `electron/main.cjs` | Window, security policy, file and storage operations. |
| `src/lib/pdfRows.ts` | Rebuilding statement rows from recognised text and position. |
| `native/pdftext.swift` | Renders PDF pages and runs the macOS text recogniser. |
| `electron/preload.cjs` | The only bridge between the interface and the disk. |

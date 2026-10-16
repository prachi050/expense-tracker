/**
 * A stand-in for the Electron bridge, used only when the interface is opened
 * in a plain browser during development. It keeps data in memory and serves a
 * sample statement so the whole flow can be exercised without packaging.
 *
 * Guarded by import.meta.env.DEV, so it is removed from production builds.
 */

const SAMPLE = `Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #
DEBIT,10/14/2026,"TRADER JOE'S #123 SAN JOSE CA",-84.21,DEBIT,2415.79,
CREDIT,10/13/2026,"ZELLE PAYMENT FROM JOHN SMITH 20261013 BACDEFGH",250.00,CREDIT,2500.00,
DEBIT,10/13/2026,"NETFLIX.COM 866-579-7172 CA",-15.49,DEBIT,2250.00,
DEBIT,10/12/2026,"SHELL OIL 57444LTR SAN JOSE CA",-48.03,DEBIT,2265.49,
DEBIT,10/12/2026,"STARBUCKS STORE 08123",-6.75,DEBIT,2313.52,
DEBIT,10/11/2026,"STARBUCKS STORE 08123",-6.75,DEBIT,2320.27,
CREDIT,10/10/2026,"ZELLE PAYMENT FROM MARIA GARCIA 20261010 XYZ",120.00,CREDIT,2327.02,
DEBIT,10/09/2026,"RENT PAYMENT OAKWOOD APARTMENTS",-1850.00,DEBIT,2207.02,
DEBIT,10/08/2026,"PG&E ELECTRIC PAYMENT",-96.42,DEBIT,4057.02,
DEBIT,10/07/2026,"AMAZON.COM*RT4R12AB1 AMZN.COM/BILL WA",-64.99,DEBIT,4153.44,
CREDIT,10/05/2026,"DIRECT DEP PAYROLL ACME CORP",2400.00,CREDIT,4218.43,
DEBIT,10/04/2026,"UBER TRIP HELP.UBER.COM CA",-23.40,DEBIT,1818.43,
DEBIT,10/03/2026,"CVS/PHARMACY #04321",-31.08,DEBIT,1841.83,
DEBIT,10/02/2026,"ONLINE BANKING TRANSFER TO SAVINGS 1234",-500.00,DEBIT,1872.91,
DEBIT,10/01/2026,"THE HALAL GUYS SAN JOSE",-18.25,DEBIT,2372.91,
`

export function installDevBridge(): void {
  if (!import.meta.env.DEV) return
  if (typeof window === 'undefined') return
  if (window.expenses) return

  let stored: unknown = null

  window.expenses = {
    pickStatements: async () => [{ name: 'sample-statement.csv', content: SAMPLE }],
    readStatement: async () => ({ name: 'sample-statement.csv', content: SAMPLE }),
    load: async () => stored,
    save: async (payload) => {
      stored = payload
      return { bytes: JSON.stringify(payload).length, path: '(in memory)' }
    },
    dataLocation: async () => '(browser preview, nothing is written to disk)',
    revealData: async () => {},
    exportCsv: async () => ({ saved: false }),
    pathForFile: () => 'sample-statement.csv',
  }
}

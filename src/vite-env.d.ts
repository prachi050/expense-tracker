/// <reference types="vite/client" />

export interface PickedFile {
  name: string
  content?: string
  error?: string
}

export interface ExpensesBridge {
  pickStatements: () => Promise<PickedFile[]>
  readStatement: (filePath: string) => Promise<{ name: string; content: string }>
  load: () => Promise<unknown>
  save: (payload: unknown) => Promise<{ bytes: number; path: string }>
  dataLocation: () => Promise<string>
  revealData: () => Promise<void>
  exportCsv: (
    suggestedName: string,
    contents: string,
  ) => Promise<{ saved: boolean; path?: string }>
  pathForFile: (file: File) => string
}

declare global {
  interface Window {
    expenses: ExpensesBridge
  }
}

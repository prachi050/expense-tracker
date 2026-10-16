/**
 * The only bridge between the sandboxed interface and the file system.
 * Each call is a named operation; the renderer never receives `fs`, a path it
 * did not get from a dialog, or any other Node capability.
 */

const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('expenses', {
  pickStatements: () => ipcRenderer.invoke('statements:pick'),
  readStatement: (filePath) => ipcRenderer.invoke('statements:read', filePath),
  load: () => ipcRenderer.invoke('data:load'),
  save: (payload) => ipcRenderer.invoke('data:save', payload),
  dataLocation: () => ipcRenderer.invoke('data:location'),
  revealData: () => ipcRenderer.invoke('data:reveal'),
  exportCsv: (suggestedName, contents) =>
    ipcRenderer.invoke('data:export', { suggestedName, contents }),
  /** Turn a dropped File into the path the main process can read. */
  pathForFile: (file) => webUtils.getPathForFile(file),
})

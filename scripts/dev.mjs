/** Start Vite, wait for it to listen, then open the Electron window. */
import { spawn } from 'node:child_process'
import net from 'node:net'

const PORT = 5181
const URL = `http://localhost:${PORT}`

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  stdio: 'inherit',
  shell: false,
})

function waitForPort(port, attempts = 100) {
  return new Promise((resolve, reject) => {
    const tryOnce = (left) => {
      const socket = net.connect(port, '127.0.0.1')
      socket.once('connect', () => { socket.destroy(); resolve() })
      socket.once('error', () => {
        socket.destroy()
        if (left <= 0) reject(new Error('Vite never started'))
        else setTimeout(() => tryOnce(left - 1), 150)
      })
    }
    tryOnce(attempts)
  })
}

await waitForPort(PORT)

const electron = spawn('npx', ['electron', '.'], {
  stdio: 'inherit',
  shell: false,
  env: { ...process.env, VITE_DEV_SERVER_URL: URL },
})

const stop = () => { electron.kill(); vite.kill(); process.exit(0) }
electron.on('exit', stop)
process.on('SIGINT', stop)
process.on('SIGTERM', stop)

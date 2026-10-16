import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createHashRouter, RouterProvider } from 'react-router-dom'
import App from './App'
import { StateProvider } from './StateProvider'
import DashboardPage from './pages/DashboardPage'
import ImportPage from './pages/ImportPage'
import IncomePage from './pages/IncomePage'
import TransactionsPage from './pages/TransactionsPage'
import SettingsPage from './pages/SettingsPage'
import { installDevBridge } from './lib/devBridge'
import './index.css'

// Only does anything when the page is opened outside Electron in development.
installDevBridge()

// Hash routing, because the packaged app is loaded over file:// where path
// based routing has no server to fall back on.
const router = createHashRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'income', element: <IncomePage /> },
      { path: 'transactions', element: <TransactionsPage /> },
      { path: 'import', element: <ImportPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <DashboardPage /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StateProvider>
      <RouterProvider router={router} />
    </StateProvider>
  </StrictMode>,
)

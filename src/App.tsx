import { useEffect } from 'react'
import { useAppStore } from './store/appStore'
import { ErrorBoundary } from './components/ErrorBoundary'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import Home from './screens/Home'
import QueryMenu from './screens/QueryMenu'
import Results from './screens/Results'
import XelionCheck from './screens/XelionCheck'
import Trickkiste from './screens/Trickkiste'
import Settings from './screens/Settings'
import type { Screen } from './types'

function renderScreen(screen: Screen) {
  switch (screen) {
    case 'home':        return <Home />
    case 'query-menu':  return <QueryMenu />
    case 'results':     return <Results />
    case 'xelion':      return <XelionCheck />
    case 'trickkiste':  return <Trickkiste />
    case 'settings':    return <Settings />
    default:            return <Home />
  }
}

export default function App() {
  const screen = useAppStore((s) => s.screen)
  const setIsAdmin = useAppStore((s) => s.setIsAdmin)
  const setAdminChecked = useAppStore((s) => s.setAdminChecked)
  const setSettings = useAppStore((s) => s.setSettings)
  const settings = useAppStore((s) => s.settings)

  // On mount: detect admin, load settings, apply theme
  useEffect(() => {
    const api = window.electronAPI
    if (!api) return

    api.checkAdmin()
      .then((isAdmin) => { setIsAdmin(isAdmin); setAdminChecked(true) })
      .catch(() => setAdminChecked(true))

    api.getSettings()
      .then((s) => {
        const merged = { ...settings, ...s }
        setSettings(merged as typeof settings)
        if (merged.theme === 'light') {
          document.documentElement.classList.add('light')
        }
      })
      .catch(() => {})
  }, [])

  // Apply theme changes
  useEffect(() => {
    if (settings.theme === 'light') document.documentElement.classList.add('light')
    else document.documentElement.classList.remove('light')
  }, [settings.theme])

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          {/*
            key={screen} resets the ErrorBoundary on every navigation,
            so an error on one page never blocks another page.
          */}
          <ErrorBoundary key={screen}>
            {renderScreen(screen)}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}

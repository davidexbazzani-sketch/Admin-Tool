import React from 'react'

interface Props {
  children: React.ReactNode
  screenKey?: string // used as key so errors reset on navigation
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const msg = `[${new Date().toISOString()}] RENDER ERROR: ${error.message}\n${error.stack ?? ''}\nComponent stack:${info.componentStack ?? ''}\n`
    console.error('[ErrorBoundary]', msg)
    // Write to app.log via IPC if available
    try {
      ;(window as Window & typeof globalThis & { electronAPI?: { log?: (m: string) => void } })
        .electronAPI?.log?.(msg)
    } catch { /* IPC not available */ }
  }

  reset() {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
            <span className="text-3xl">⚠️</span>
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Ein Fehler ist aufgetreten</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Diese Seite konnte nicht geladen werden. Bitte versuche es erneut.
            </p>
            {this.state.error && (
              <p className="text-xs text-destructive mt-3 font-mono bg-destructive/5 border border-destructive/20 rounded-md px-3 py-2 max-w-md mx-auto text-left break-all">
                {this.state.error.message}
              </p>
            )}
          </div>
          <button
            onClick={() => this.reset()}
            className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Erneut versuchen
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

import { Minus, Maximize2, X } from 'lucide-react'
import { ipcRenderer } from '../utils/ipc'

export default function TitleBar() {
  return (
    <div
      className="flex items-center justify-between h-9 px-4 bg-sidebar select-none shrink-0"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <span className="text-xs font-semibold text-muted-foreground tracking-widest uppercase">
        IT Admin Tool
      </span>
      <div
        className="flex gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={() => ipcRenderer('window:minimize')}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 text-muted-foreground transition-colors"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={() => ipcRenderer('window:maximize')}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 text-muted-foreground transition-colors"
        >
          <Maximize2 size={13} />
        </button>
        <button
          onClick={() => ipcRenderer('window:close')}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-500 text-muted-foreground hover:text-white transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

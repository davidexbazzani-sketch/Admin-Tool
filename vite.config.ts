import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

/**
 * start.html lässt erst das Logo zeichnen und lädt dann das Tool nach (src/start.ts → import('./main')).
 * Damit dabei keine Zeit verloren geht, wird das große Hauptpaket schon beim Öffnen der Seite geholt
 * und übersetzt (modulepreload) — nur die AUSFÜHRUNG wartet auf das erste Bild.
 * Gemessen 17.11.2026 (je 8 Läufe): Anmeldung sichtbar Median 0,93–0,96 s gegenüber 0,91 s ohne
 * Start-Animation — das Fenster (mit Logo) erscheint dafür schon nach ~0,5 s statt ~0,9 s.
 */
function startVorladen(): Plugin {
  return {
    name: 'start-vorladen',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle || !/start\.html$/.test(ctx.filename)) return
        const chunks = Object.values(ctx.bundle).filter((c): c is Extract<typeof c, { type: 'chunk' }> => c.type === 'chunk')
        const haupt = chunks.find(c => c.moduleIds.some(id => id.replace(/\\/g, '/').endsWith('/src/main.tsx')))
        if (!haupt) { this.warn('start-vorladen: Hauptpaket (src/main.tsx) nicht gefunden'); return }
        // Hauptpaket + alles, was es fest einbindet
        const dateien = new Set<string>()
        const sammle = (name: string) => {
          if (dateien.has(name)) return
          dateien.add(name)
          const c = chunks.find(x => x.fileName === name)
          for (const i of c?.imports ?? []) sammle(i)
        }
        sammle(haupt.fileName)
        // was Vite schon selbst vorlädt, nicht doppelt eintragen
        return [...dateien].filter(f => !html.includes(f)).map(f => ({
          tag: 'link',
          attrs: { rel: 'modulepreload', crossorigin: true, href: './' + f },
          injectTo: 'head' as const,
        }))
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), startVorladen()],
  base: './',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // start.html = Hauptfenster (mit Start-Animation), index.html = Unterfenster (Präsentation,
    // Task-Manager, Sound Fix, Aufnahme) — beide teilen dieselben Assets.
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        start: resolve(__dirname, 'start.html'),
      },
    },
  },
  server: {
    port: 5173,
  },
})

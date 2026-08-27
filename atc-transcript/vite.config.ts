import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const VIRTUAL_ID = 'virtual:records'
const RESOLVED_ID = '\0' + VIRTUAL_ID
const AUDIO_DIR = resolve(import.meta.dirname, 'public/audio')

/** Scan public/audio and pair each .mp3 with its same-named .txt transcript, if any. */
function listRecords() {
  let files: string[]
  try {
    files = readdirSync(AUDIO_DIR)
  } catch {
    return []
  }

  return files
    .filter((file) => file.toLowerCase().endsWith('.mp3'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .map((file) => {
      const name = file.slice(0, -'.mp3'.length)
      const transcript = `${name}.txt`
      return {
        name,
        audioUrl: `/audio/${encodeURIComponent(file)}`,
        transcriptUrl: existsSync(resolve(AUDIO_DIR, transcript))
          ? `/audio/${encodeURIComponent(transcript)}`
          : null,
      }
    })
}

/** Exposes the contents of public/audio as `virtual:records`. */
function records(): Plugin {
  return {
    name: 'records',
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null
    },
    load(id) {
      return id === RESOLVED_ID
        ? `export default ${JSON.stringify(listRecords())}`
        : null
    },
    configureServer(server) {
      server.watcher.add(AUDIO_DIR)

      const refresh = (path: string) => {
        if (!path.startsWith(AUDIO_DIR)) return
        const module = server.moduleGraph.getModuleById(RESOLVED_ID)
        if (module) server.moduleGraph.invalidateModule(module)
        server.ws.send({ type: 'full-reload' })
      }

      server.watcher.on('add', refresh)
      server.watcher.on('unlink', refresh)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), records()],
})

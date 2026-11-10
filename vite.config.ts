import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig, type Plugin } from 'vite'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'

/** Dev-only: the editor's Save button writes public/layout.json. */
function layoutApi(): Plugin {
  const file = path.resolve('public/layout.json')
  const readBody = (req: IncomingMessage) =>
    new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', () => resolve(Buffer.concat(chunks).toString()))
      req.on('error', reject)
    })
  const send = (res: ServerResponse, code: number, body: string) => {
    res.statusCode = code
    res.setHeader('Content-Type', 'application/json')
    res.end(body)
  }
  return {
    name: 'layout-api',
    configureServer(server) {
      server.middlewares.use('/api/layout', (req, res) => {
        if (req.method === 'GET') return send(res, 200, fs.readFileSync(file, 'utf8'))
        if (req.method !== 'POST') return send(res, 405, '{"error":"POST only"}')
        void readBody(req)
          .then((body) => {
            const data: unknown = JSON.parse(body)
            if (!Array.isArray(data)) throw new Error('expected an array')
            fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
            send(res, 200, '{"ok":true}')
          })
          .catch((e: Error) => send(res, 400, JSON.stringify({ error: e.message })))
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    layoutApi(),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})

import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import fs from 'node:fs'

if (!fs.existsSync('dist/index.html')) {
  console.error('BLOCKED: dist/index.html not found. Run npm run build first.')
  process.exit(2)
}
const candidates = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']
const browser = candidates.find(p => fs.existsSync(p))
if (!browser) {
  console.error('BLOCKED: Chromium/Chrome was not found. Install a supported browser to run this smoke test.')
  process.exit(2)
}
const server = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { stdio: 'ignore', shell: process.platform === 'win32' })
try {
  let ready = false
  for (let i = 0; i < 30; i++) {
    await delay(500)
    try {
      const response = await fetch('http://127.0.0.1:4173')
      if (response.ok) { ready = true; break }
    } catch {}
  }
  if (!ready) throw new Error('Vite preview server did not become ready on port 4173')
  const result = spawn(browser, ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--virtual-time-budget=8000', '--dump-dom', 'http://127.0.0.1:4173'], { stdio: ['ignore', 'pipe', 'pipe'] })
  let output = '', errors = ''
  result.stdout.setEncoding('utf8'); result.stderr.setEncoding('utf8')
  result.stdout.on('data', x => output += x); result.stderr.on('data', x => errors += x)
  const exitCode = await new Promise(resolve => result.on('close', resolve))
  if (exitCode !== 0 || !output.includes('<div id="root"')) throw new Error(`Chromium smoke test failed (exit ${exitCode}). ${errors.slice(-1200)}`)
  if (output.includes('Internal Server Error')) throw new Error('Production preview returned Internal Server Error')
  console.log('PASS: production preview served HTML and Chromium opened the app entry point.')
  console.log('LIMIT: this smoke test does not validate authenticated Supabase flows, all language strings, or printer hardware.')
} catch (error) {
  console.error(`FAIL: ${error.message}`)
  process.exitCode = 1
} finally {
  server.kill('SIGTERM')
}

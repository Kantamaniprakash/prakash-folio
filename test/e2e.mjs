// Runtime deploy gate: boots the BUILT game in a real headless Chrome, sits
// at the intro (time-dependent bugs like audio queue growth), enters the
// world (reveal-step bugs like the NaN whisper crash), and fails on any
// uncaught exception. Requires `npm run build` first.
//
// Works locally (Windows/Chrome) and on GitHub runners (linux/chrome).
import { spawn, execSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const PORT = 4173
const CDP_PORT = 9224
const INTRO_IDLE_MS = 25_000
const POST_ENTER_MS = 20_000

const chromeCandidates = process.platform === 'win32'
    ? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']
    : ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium']
const chrome = chromeCandidates.find(p => existsSync(p))
if (!chrome) { console.error('no chrome found'); process.exit(1) }

const cleanup = []
const kill = () => { for (const p of cleanup) try { p.kill() } catch {} }
process.on('exit', kill)

// Serve dist
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { shell: true, stdio: 'ignore' })
cleanup.push(server)

// Launch chrome — real GPU where available, SwiftShader software GL on
// GPU-less CI runners (modern Chrome requires the explicit unsafe opt-in)
const gpuFlags = process.platform === 'win32'
    ? ['--enable-unsafe-webgpu', '--enable-gpu']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
const browser = spawn(chrome, [
    '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--window-size=1400,800',
    '--no-sandbox', '--disable-dev-shm-usage', ...gpuFlags,
    '--user-data-dir=' + (process.platform === 'win32' ? process.env.TEMP : '/tmp') + '/e2e-chrome-profile',
    '--no-first-run', 'about:blank',
], { stdio: 'ignore' })
cleanup.push(browser)

// Wait for both
const waitFor = async (url, timeout = 30_000) => {
    const start = Date.now()
    while (Date.now() - start < timeout) {
        try { await fetch(url); return true } catch { await new Promise(r => setTimeout(r, 500)) }
    }
    return false
}
if (!await waitFor(`http://localhost:${PORT}/`)) { console.error('preview server never came up'); process.exit(1) }
if (!await waitFor(`http://127.0.0.1:${CDP_PORT}/json`)) { console.error('chrome CDP never came up'); process.exit(1) }

const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()
const page = targets.find(t => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
const send = (method, params = {}) => new Promise(res => {
    const mid = ++id; pending.set(mid, res)
    ws.send(JSON.stringify({ id: mid, method, params }))
})
const exceptions = []
ws.onmessage = ev => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id) }
    if (msg.method === 'Runtime.exceptionThrown')
        exceptions.push((msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text).slice(0, 300))
}
await new Promise(res => ws.onopen = res)
await send('Runtime.enable')
await send('Page.enable')
await send('Page.navigate', { url: `http://localhost:${PORT}/` })
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true }))?.result?.value

// Wait for the game to boot (canvas + started class), generous for software GL
let started = false
for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000))
    const cls = await evalJs('document.documentElement.className') ?? ''
    if (cls.includes('is-started')) { started = true; break }
    if (cls.includes('is-fallback')) { console.error('FAIL: capability fallback shown in e2e browser'); process.exit(1) }
}
if (!started) { console.error('FAIL: game never booted'); console.error(exceptions.join('\n')); process.exit(1) }
console.log('game booted')

// Idle at the intro — time-dependent bug window
await new Promise(r => setTimeout(r, INTRO_IDLE_MS))

// Enter the world
let entered = false
for (let i = 0; i < 20; i++) {
    for (const type of ['keyDown', 'keyUp'])
        await send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await new Promise(r => setTimeout(r, 3000))
    const cls = await evalJs('document.documentElement.className') ?? ''
    if (cls.includes('input-filter-wandering')) { entered = true; break }
}
if (!entered) { console.error('FAIL: never entered the world'); console.error(exceptions.join('\n')); process.exit(1) }
console.log('entered the world')

// Post-entry window — reveal-step-2 bug window (whispers, areas, audio flush)
await new Promise(r => setTimeout(r, POST_ENTER_MS))

if (exceptions.length) {
    console.error(`FAIL: ${exceptions.length} uncaught exception(s):`)
    console.error([...new Set(exceptions)].slice(0, 5).join('\n---\n'))
    process.exit(1)
}
console.log('PASS: booted, idled, entered, no exceptions')
process.exit(0)

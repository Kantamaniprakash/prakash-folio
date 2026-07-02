// Deploy gate: validates the production build and the live backend before
// the site ships. Run after `npm run build` (used by .github/workflows/deploy.yml).
import { readFileSync, statSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIST = new URL('../dist', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const SERVER = 'https://prakash-folio-server.kantamaniprakash.workers.dev'

let failures = 0
const check = (label, ok) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
    if (!ok) failures++
}

// 1. index.html sanity
const html = readFileSync(join(DIST, 'index.html'), 'utf8')
check('index.html contains canvas', html.includes('js-canvas'))
check('index.html contains structured data', html.includes('application/ld+json'))
check('index.html contains capability fallback', html.includes('capability-fallback'))
check('index.html has no third-party analytics', !html.includes('googletagmanager'))
const bundleMatch = html.match(/assets\/index-[A-Za-z0-9_-]+\.js/)
check('index.html references a JS bundle', !!bundleMatch)

// 2. Bundle sanity
if (bundleMatch) {
    const bundle = readFileSync(join(DIST, bundleMatch[0]), 'utf8')
    check('bundle is non-trivial (>1MB)', bundle.length > 1_000_000)
    check('bundle wires the leaderboard server', bundle.includes('prakash-folio-server.kantamaniprakash.workers.dev'))
}

// 3. Critical assets
const asset = (path, minBytes) => {
    try { return statSync(join(DIST, path)).size >= minBytes } catch { return false }
}
check('resume PDF present', asset('Prakash_Kantamani_Resume.pdf', 10_000))
check('draco areas model present', asset('areas/areas-compressed.glb', 500_000))
check('share image present', asset('social/share-image.png', 100_000))
check('sitemap present', asset('sitemap.xml', 100))

// 4. Live backend
try {
    const stats = await fetch(`${SERVER}/stats`, { signal: AbortSignal.timeout(10_000) })
    check('worker /stats responds', stats.ok)
} catch {
    check('worker /stats responds', false)
}

await new Promise((resolve) => {
    const ws = new WebSocket(SERVER.replace('https', 'wss'))
    ws.binaryType = 'arraybuffer'
    const timer = setTimeout(() => { check('worker websocket sends init', false); ws.close(); resolve() }, 10_000)
    ws.onmessage = () => { clearTimeout(timer); check('worker websocket sends init', true); ws.close(); resolve() }
    ws.onerror = () => { clearTimeout(timer); check('worker websocket sends init', false); resolve() }
})

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
process.exit(failures ? 1 : 0)

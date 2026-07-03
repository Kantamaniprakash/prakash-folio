// Backend for the 3D portfolio — three services on one Worker:
//
//   WS  /            msgpack-over-WebSocket game protocol (leaderboard + altar)
//   POST /event      self-hosted analytics beacon (counters only, no PII)
//   GET  /stats      aggregated analytics, public JSON
//   POST /chat       AI guide grounded in Prakash's profile (Workers AI)
//
// One Durable Object instance holds all state and connected sockets.
import { encode, decode } from '@msgpack/msgpack'

const WEEK = 7 * 24 * 60 * 60 * 1000
const LEADERBOARD_SIZE = 10
const MIN_DURATION = 15 * 1000       // laps faster than 15s are bogus
const MAX_DURATION = 30 * 60 * 1000  // ignore 30min+ entries
const CATACLYSM_GOAL = 100

const ANALYTICS_EVENTS = new Set([
    'session_start', 'reveal_enter', 'area_visit',
    'resume_click', 'toast_click', 'ai_chat_open', 'lap_complete', 'fallback_shown',
])
const ANALYTICS_KEEP_DAYS = 90

const CHAT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
const CHAT_PER_IP_DAILY = 30
const CHAT_GLOBAL_DAILY = 400
const CHAT_SYSTEM_PROMPT = `You are the friendly AI guide living inside the interactive 3D portfolio of Satya Sai Prakash Kantamani ("Prakash"). Visitors drive a little car around his world and can ask you about him. Answer questions about Prakash using ONLY the facts below. Be warm, concise (2-4 sentences), and helpful. If asked something not covered here, say you don't have that detail and suggest emailing Prakash. Never invent facts.

ABOUT PRAKASH
- Data Scientist & Gen AI Engineer based in Richardson, Texas. Open to Gen AI and Data Science roles.
- Contact: prakashkantamani90@gmail.com · github.com/kantamaniprakash · linkedin.com/in/prakash-kantamani · Resume: downloadable next to his name at the landing area of this world.

EXPERIENCE
- AAA National (Texas) — Data Scientist, Aug 2024 to present. Production ML pipelines over 240M+ row datasets using Snowflake, R and AWS S3; forecasting and member analytics.
- Imperium Data (Florida) — Data Analyst Intern, Aug-Dec 2023. Azure Databricks, PyTorch, K-Means clustering.
- Skilalogy (India) — Data Analyst, Jan 2020 to Dec 2021. Computer-vision defect detection, Tableau dashboards.

EDUCATION
- M.S. Business Analytics & Machine Learning — University of Texas at Dallas (2022-2024).
- B.Tech Computer Science — VIT Amaravathi, India (2017-2021).
- Google Data Analytics certification.

PROJECTS (all on his GitHub)
- Financial RAG Chatbot: retrieval-augmented Q&A over financial documents. LangChain, GPT-4o, ChromaDB, FAISS, Streamlit.
- Data Analysis AI Agent: autonomous ReAct agent that writes and runs pandas code from natural language. LangChain, Streamlit.
- Bitcoin Price Forecasting: ARIMA & VAR models, 95% confidence intervals, Granger causality analysis.
- Business Location Analysis: geospatial ML with 96% accuracy.
- Portfolio Management ML: ARIMA + NLP sentiment, >60% directional accuracy.

ABOUT THIS PORTFOLIO
- A 3D driving world. The circuit has a live weekly leaderboard, the career road shows his timeline (1 road unit = 1 year), the social plaza links to his profiles, and the project stands show his work.`

const today = () => new Date().toISOString().slice(0, 10)
const periodStart = (now) => now - (now % WEEK)

const corsHeaders = (request) => {
    const origin = request.headers.get('Origin') ?? ''
    const allowed = origin.startsWith('http://localhost') || origin === 'https://kantamaniprakash.github.io'
    return {
        'Access-Control-Allow-Origin': allowed ? origin : 'https://kantamaniprakash.github.io',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    }
}

const json = (data, request, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders(request) } })

export class Leaderboard {
    constructor(state, env) {
        this.state = state
        this.env = env
    }

    async fetch(request) {
        const url = new URL(request.url)

        if (request.method === 'OPTIONS')
            return new Response(null, { status: 204, headers: corsHeaders(request) })

        if (request.headers.get('Upgrade') === 'websocket')
            return this.handleWebSocket()

        if (url.pathname === '/event' && request.method === 'POST')
            return this.handleEvent(request)

        if (url.pathname === '/stats' && request.method === 'GET')
            return this.handleStats(request)

        if (url.pathname === '/chat' && request.method === 'POST')
            return this.handleChat(request)

        return new Response('not found', { status: 404, headers: corsHeaders(request) })
    }

    // ── Game protocol (leaderboard + altar) ──────────────────────────

    async handleWebSocket() {
        const pair = new WebSocketPair()
        this.state.acceptWebSocket(pair[1])

        const data = await this.readData()
        pair[1].send(encode({
            type: 'init',
            circuitResetTime: data.week,
            circuitLeaderboard: data.scores.map(s => [s.tag, s.country, s.duration]),
            cataclysmCount: data.cataclysmCount,
            cataclysmProgress: (data.cataclysmCount % CATACLYSM_GOAL) / CATACLYSM_GOAL,
            whispers: data.whispers,
            cookiesCount: data.cookiesCount,
        }))

        return new Response(null, { status: 101, webSocket: pair[0] })
    }

    async readData() {
        let data = await this.state.storage.get('data') ?? { week: periodStart(Date.now()), scores: [], cataclysmCount: 0 }
        const currentWeek = periodStart(Date.now())
        if (data.week !== currentWeek) {
            data = { ...data, week: currentWeek, scores: [] }
            await this.state.storage.put('data', data)
        }
        data.whispers = data.whispers ?? []
        data.whisperId = data.whisperId ?? 0
        data.cookiesCount = data.cookiesCount ?? 0
        return data
    }

    broadcast(message) {
        const bytes = encode(message)
        for (const ws of this.state.getWebSockets()) {
            try { ws.send(bytes) } catch (_) { /* stale socket */ }
        }
    }

    async webSocketMessage(ws, raw) {
        let message
        try {
            message = decode(new Uint8Array(raw))
        } catch (_) {
            return
        }
        if (!message || typeof message !== 'object') return

        if (message.type === 'circuitInsert') {
            const tag = String(message.tag ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3)
            const country = String(message.countryCode ?? '').toLowerCase().slice(0, 2)
            const duration = Math.round(Number(message.duration))
            const uuid = String(message.uuid ?? '')

            if (tag.length !== 3 || !uuid) return
            if (!Number.isFinite(duration) || duration < MIN_DURATION || duration > MAX_DURATION) return

            const data = await this.readData()

            const existing = data.scores.find(s => s.uuid === uuid)
            if (existing) {
                if (duration >= existing.duration) return
                existing.duration = duration
                existing.tag = tag
                existing.country = country
            } else {
                data.scores.push({ uuid, tag, country, duration })
            }

            data.scores.sort((a, b) => a.duration - b.duration)
            data.scores = data.scores.slice(0, LEADERBOARD_SIZE)
            await this.state.storage.put('data', data)

            this.broadcast({
                type: 'circuitUpdate',
                circuitLeaderboard: data.scores.map(s => [s.tag, s.country, s.duration]),
            })
        }
        else if (message.type === 'whispersInsert') {
            const text = String(message.message ?? '').slice(0, 120).trim()
            if (!text) return
            const country = String(message.countryCode ?? '').toLowerCase().slice(0, 2)
            const x = Number(message.x), y = Number(message.y), z = Number(message.z)
            if (![x, y, z].every(Number.isFinite)) return

            const data = await this.readData()
            data.whisperId += 1
            const whisper = { id: data.whisperId, message: text, countrycode: country, x, y, z }
            data.whispers.push(whisper)

            // Keep the newest MAX_WHISPERS, tell clients about evictions
            const MAX_WHISPERS = 30
            const removed = data.whispers.splice(0, Math.max(0, data.whispers.length - MAX_WHISPERS))
            await this.state.storage.put('data', data)

            this.broadcast({ type: 'whispersInsert', whispers: [whisper] })
            if (removed.length)
                this.broadcast({ type: 'whispersDelete', whispers: removed })
        }
        else if (message.type === 'cookiesInsert') {
            const data = await this.readData()
            data.cookiesCount += Math.min(Math.max(Math.round(Number(message.amount ?? 1)) || 1, 1), 100)
            await this.state.storage.put('data', data)
            this.broadcast({ type: 'cookiesUpdate', cookiesCount: data.cookiesCount })
        }
        else if (message.type === 'cataclysmInsert') {
            const data = await this.readData()
            data.cataclysmCount += 1
            await this.state.storage.put('data', data)

            this.broadcast({
                type: 'cataclysmUpdate',
                cataclysmCount: data.cataclysmCount,
                cataclysmProgress: (data.cataclysmCount % CATACLYSM_GOAL) / CATACLYSM_GOAL,
            })
        }
    }

    async webSocketClose() { /* nothing to clean up */ }
    async webSocketError() { /* nothing to clean up */ }

    // ── Analytics (counters only, no PII) ────────────────────────────

    async handleEvent(request) {
        let body
        try { body = await request.json() } catch (_) { return json({ ok: false }, request, 400) }

        const name = String(body?.name ?? '')
        if (!ANALYTICS_EVENTS.has(name)) return json({ ok: false }, request, 400)

        // Only area_visit carries a meta value, capped to a short slug
        let key = name
        if (name === 'area_visit') {
            const area = String(body?.meta ?? '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 20)
            if (area) key = `${name}:${area}`
        }

        const analytics = await this.state.storage.get('analytics') ?? {}
        const day = today()
        analytics[day] = analytics[day] ?? {}
        analytics[day][key] = (analytics[day][key] ?? 0) + 1

        // Prune old days
        const days = Object.keys(analytics).sort()
        while (days.length > ANALYTICS_KEEP_DAYS) delete analytics[days.shift()]

        await this.state.storage.put('analytics', analytics)
        return json({ ok: true }, request)
    }

    async handleStats(request) {
        const analytics = await this.state.storage.get('analytics') ?? {}
        return json(analytics, request)
    }

    // ── AI guide ─────────────────────────────────────────────────────

    async handleChat(request) {
        let body
        try { body = await request.json() } catch (_) { return json({ error: 'bad request' }, request, 400) }

        const messages = Array.isArray(body?.messages) ? body.messages : []
        const sanitized = messages
            .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
            .slice(-8)
            .map(m => ({ role: m.role, content: m.content.slice(0, 500) }))

        if (!sanitized.length || sanitized[sanitized.length - 1].role !== 'user')
            return json({ error: 'no message' }, request, 400)

        // Rate limits: per IP and global, per day
        const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
        const day = today()
        const limits = await this.state.storage.get('chatLimits') ?? {}
        if (limits.day !== day) { limits.day = day; limits.global = 0; limits.ips = {} }
        limits.ips[ip] = (limits.ips[ip] ?? 0) + 1
        limits.global += 1
        await this.state.storage.put('chatLimits', limits)

        if (limits.ips[ip] > CHAT_PER_IP_DAILY || limits.global > CHAT_GLOBAL_DAILY)
            return json({ reply: "I've chatted a lot today and need to rest! Please email Prakash directly at prakashkantamani90@gmail.com." }, request)

        try {
            const result = await this.env.AI.run(CHAT_MODEL, {
                messages: [
                    { role: 'system', content: CHAT_SYSTEM_PROMPT },
                    ...sanitized,
                ],
                max_tokens: 400,
            })
            return json({ reply: result.response ?? "Sorry, I couldn't think of an answer. Try again?" }, request)
        } catch (error) {
            return json({ reply: 'My brain is briefly offline — please try again in a moment, or email Prakash at prakashkantamani90@gmail.com.' }, request)
        }
    }
}

export default {
    async fetch(request, env) {
        // ?room=... isolates state (e.g. room=test for e2e runs);
        // production clients use the default room
        const room = new URL(request.url).searchParams.get('room') ?? 'global'
        const id = env.LEADERBOARD.idFromName(room.slice(0, 32))
        return env.LEADERBOARD.get(id).fetch(request)
    },
}

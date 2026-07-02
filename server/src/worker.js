// Game server for the 3D portfolio — speaks the msgpack-over-WebSocket
// protocol the game client (sources/Game/Server.js) expects.
//
// Features:
//   - Circuit leaderboard: top 10 lap times, resets weekly
//   - Altar cataclysm counter: global click counter with progress
//
// One Durable Object instance holds all state and connected sockets.
import { encode, decode } from '@msgpack/msgpack'

const WEEK = 7 * 24 * 60 * 60 * 1000
const LEADERBOARD_SIZE = 10
const MIN_DURATION = 15 * 1000       // laps faster than 15s are bogus
const MAX_DURATION = 30 * 60 * 1000  // ignore 30min+ entries
const CATACLYSM_GOAL = 100

const periodStart = (now) => now - (now % WEEK)

export class Leaderboard {
    constructor(state) {
        this.state = state
    }

    async fetch(request) {
        if (request.headers.get('Upgrade') !== 'websocket')
            return new Response('expected websocket', { status: 426 })

        const pair = new WebSocketPair()
        this.state.acceptWebSocket(pair[1])

        // Send init snapshot to the new client
        const data = await this.readData()
        pair[1].send(encode({
            type: 'init',
            circuitResetTime: data.week,
            circuitLeaderboard: data.scores.map(s => [s.tag, s.country, s.duration]),
            cataclysmCount: data.cataclysmCount,
            cataclysmProgress: (data.cataclysmCount % CATACLYSM_GOAL) / CATACLYSM_GOAL,
        }))

        return new Response(null, { status: 101, webSocket: pair[0] })
    }

    async readData() {
        let data = await this.state.storage.get('data') ?? { week: periodStart(Date.now()), scores: [], cataclysmCount: 0 }
        // Weekly reset
        const currentWeek = periodStart(Date.now())
        if (data.week !== currentWeek) {
            data = { ...data, week: currentWeek, scores: [] }
            await this.state.storage.put('data', data)
        }
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

            // Keep each player's best time only
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
}

export default {
    async fetch(request, env) {
        const id = env.LEADERBOARD.idFromName('global')
        return env.LEADERBOARD.get(id).fetch(request)
    },
}

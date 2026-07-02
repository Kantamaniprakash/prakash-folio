import * as THREE from 'three/webgpu'
import { Game } from './Game.js'
import { GhostVehicle } from './GhostVehicle.js'

/**
 * Live visitors as translucent ghost cars. Positions stream over the game
 * server WebSocket (playerUpdate/playerLeave); rendering interpolates
 * between updates. Own position is sent ~4x/second once in the world.
 */
export class Multiplayer
{
    constructor()
    {
        this.game = Game.getInstance()

        this.ghosts = new Map()
        this.maxGhosts = 10
        this.sendInterval = 0.25
        this.lastSent = 0
        this.lastPosition = new THREE.Vector3()
        this.heading = 0

        this.game.server.events.on('message', (data) =>
        {
            if(data.type === 'init')
            {
                for(const player of data.players ?? [])
                    this.upsert(player.id, player.x, player.y, player.z, player.ry)
            }
            else if(data.type === 'playerUpdate')
                this.upsert(data.id, data.x, data.y, data.z, data.ry)
            else if(data.type === 'playerLeave')
                this.remove(data.id)
        })

        if(this.game.server.initData)
        {
            for(const player of this.game.server.initData.players ?? [])
                this.upsert(player.id, player.x, player.y, player.z, player.ry)
        }

        this.game.server.events.on('disconnected', () =>
        {
            for(const id of [ ...this.ghosts.keys() ])
                this.remove(id)
        })

        this.game.ticker.events.on('tick', () =>
        {
            this.update()
        }, 9)
    }

    upsert(id, x, y, z, ry)
    {
        if(!id || id === this.game.server.uuid)
            return
        if(![ x, y, z, ry ].every(Number.isFinite))
            return

        let ghost = this.ghosts.get(id)

        if(!ghost)
        {
            if(this.ghosts.size >= this.maxGhosts)
                return

            ghost = {
                vehicle: new GhostVehicle(),
                target: new THREE.Vector3(x, y, z),
                targetRy: ry,
                lastSeen: this.game.ticker.elapsed,
            }
            ghost.vehicle.group.position.set(x, y, z)
            ghost.vehicle.group.rotation.y = ry
            ghost.vehicle.show()
            this.ghosts.set(id, ghost)
        }

        ghost.target.set(x, y, z)
        ghost.targetRy = ry
        ghost.lastSeen = this.game.ticker.elapsed
    }

    remove(id)
    {
        const ghost = this.ghosts.get(id)
        if(!ghost)
            return
        ghost.vehicle.dispose()
        this.ghosts.delete(id)
    }

    update()
    {
        const ticker = this.game.ticker

        // Broadcast own position once in the world
        if(
            this.game.server.connected &&
            this.game.reveal && this.game.reveal.step >= 1 &&
            ticker.elapsed - this.lastSent > this.sendInterval
        )
        {
            this.lastSent = ticker.elapsed
            const position = this.game.player.position

            const dx = position.x - this.lastPosition.x
            const dz = position.z - this.lastPosition.z
            if(dx * dx + dz * dz > 0.0004)
                this.heading = Math.atan2(dx, dz)
            this.lastPosition.copy(position)

            this.game.server.send({
                type: 'playerUpdate',
                x: Math.round(position.x * 100) / 100,
                y: Math.round(position.y * 100) / 100,
                z: Math.round(position.z * 100) / 100,
                ry: Math.round(this.heading * 1000) / 1000,
            })
        }

        // Interpolate ghosts toward their latest known state
        const lerpAlpha = Math.min(ticker.delta * 6, 1)
        for(const [ id, ghost ] of this.ghosts)
        {
            if(ticker.elapsed - ghost.lastSeen > 12)
            {
                this.remove(id)
                continue
            }

            const group = ghost.vehicle.group
            group.position.lerp(ghost.target, lerpAlpha)

            let deltaRy = ghost.targetRy - group.rotation.y
            deltaRy = ((deltaRy + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI
            group.rotation.y += deltaRy * lerpAlpha
        }
    }
}

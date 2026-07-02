import * as THREE from 'three/webgpu'
import { Game } from './Game.js'

/**
 * Translucent car used for other live visitors (Multiplayer) and the
 * best-lap replay (CircuitArea). Cloned from the pristine vehicle template
 * captured before VisualVehicle consumes the original scene.
 */
export class GhostVehicle
{
    constructor(color = '#5390ff', opacity = 0.3)
    {
        this.game = Game.getInstance()

        this.group = this.game.resources.vehicleGhostTemplate.clone(true)

        const material = new THREE.MeshBasicNodeMaterial({
            color: color,
            transparent: true,
            opacity: opacity,
            depthWrite: false,
        })

        this.group.traverse((child) =>
        {
            if(child.isMesh)
            {
                child.material = material
                child.castShadow = false
                child.receiveShadow = false
            }
        })

        this.group.visible = false
        this.game.scene.add(this.group)
    }

    show() { this.group.visible = true }
    hide() { this.group.visible = false }

    dispose()
    {
        this.group.removeFromParent()
    }
}

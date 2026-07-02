import './threejs-override.js'
import { Game } from './Game/Game.js'
import consoleLog from './data/consoleLog.js'

if(import.meta.env.VITE_LOG)
    console.log(
        ...consoleLog
    )

// The world needs WebGL2 or WebGPU — everyone else gets the static fallback
const testCanvas = document.createElement('canvas')
const isCapable = !!navigator.gpu || !!testCanvas.getContext('webgl2')

if(!isCapable)
{
    document.documentElement.classList.add('is-fallback')

    const serverUrl = import.meta.env.VITE_SERVER_URL
    if(serverUrl && navigator.doNotTrack !== '1')
    {
        try
        {
            navigator.sendBeacon(
                `${serverUrl.replace(/^ws/, 'http')}/event`,
                new Blob([ JSON.stringify({ name: 'fallback_shown' }) ], { type: 'text/plain' })
            )
        }
        catch(_) {}
    }
}
else if(import.meta.env.VITE_GAME_PUBLIC)
    window.game = new Game()
else
    new Game()

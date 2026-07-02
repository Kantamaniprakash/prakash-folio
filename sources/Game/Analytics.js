/**
 * Privacy-friendly self-hosted analytics: anonymous event counters sent to
 * the portfolio worker (server/src/worker.js). No cookies, no identifiers,
 * no PII — and nothing at all when Do Not Track is on.
 */
export class Analytics
{
    constructor()
    {
        const serverUrl = import.meta.env.VITE_SERVER_URL ?? ''
        this.base = serverUrl.replace(/^ws/, 'http')
        this.enabled = !!this.base && navigator.doNotTrack !== '1'
        this.sent = new Set()

        this.send('session_start')
    }

    send(name, meta = null, once = true)
    {
        if(!this.enabled)
            return

        const key = `${name}:${meta}`
        if(once && this.sent.has(key))
            return
        this.sent.add(key)

        try
        {
            // text/plain keeps the beacon a "simple request" (no preflight);
            // the worker parses the body as JSON regardless
            navigator.sendBeacon(
                `${this.base}/event`,
                new Blob([ JSON.stringify({ name, meta }) ], { type: 'text/plain' })
            )
        }
        catch(_)
        {
            // analytics must never break the experience
        }
    }
}

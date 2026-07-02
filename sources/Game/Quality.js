import { Events } from './Events.js'
import { Game } from './Game.js'

export class Quality
{
    constructor()
    {
        this.game = Game.getInstance()

        this.events = new Events()

        const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
        this.level = isMobile ? 1 : 0 // 0 = highest quality

        // Deferred: Quality is constructed before Ticker during Game.init
        queueMicrotask(() => this.setAutoDowngrade())

        // Debug
        if(this.game.debug.active)
        {
            const debugPanel = this.game.debug.panel.addFolder({
                title: '⚙️ Quality',
                expanded: false,
            })

            this.game.debug.addButtons(
                debugPanel,
                {
                    low: () =>
                    {
                        this.changeLevel(1)
                    },
                    high: () =>
                    {
                        this.changeLevel(0)
                    },
                },
                'change'
            )
        }
    }

    setAutoDowngrade()
    {
        // If the machine can't hold ~45fps for a few seconds once the player
        // is in the world (weak GPU, thermal throttling...), drop to the low
        // quality preset (smaller shadows, lighter bloom, no DOF). One-way and
        // once — the user can always switch back in the menu options.
        this.slowSince = null
        this.autoDowngraded = false

        this.game.ticker.events.on('tick', () =>
        {
            if(this.level !== 0 || this.autoDowngraded)
                return

            if(!this.game.reveal || this.game.reveal.step < 2)
                return

            if(this.game.ticker.deltaAverage > 1 / 45)
            {
                this.slowSince = this.slowSince ?? this.game.ticker.elapsed

                if(this.game.ticker.elapsed - this.slowSince > 4)
                {
                    this.autoDowngraded = true
                    this.changeLevel(1)
                    this.game.notifications?.show('Performance mode enabled for smoother driving — switch back anytime in the menu options', '', 8)
                }
            }
            else
            {
                this.slowSince = null
            }
        })
    }

    changeLevel(level = 0)
    {
        // Same
        if(level === this.level)
            return
            
        this.level = level
        this.events.trigger('change', [ this.level ])
    }
}
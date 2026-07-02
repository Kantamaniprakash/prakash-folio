import { Game } from './Game.js'

/**
 * Chat UI for the in-world AI guide. The modal markup lives in index.html
 * (data-name="ai-guide"); answers come from the portfolio worker's /chat
 * endpoint (Workers AI, grounded in Prakash's profile).
 */
export class AIGuide
{
    constructor()
    {
        this.game = Game.getInstance()

        const serverUrl = import.meta.env.VITE_SERVER_URL ?? ''
        this.endpoint = serverUrl ? serverUrl.replace(/^ws/, 'http') + '/chat' : null

        this.messages = []
        this.busy = false

        this.element = document.querySelector('.js-ai-guide')
        if(!this.element)
            return

        this.logElement = this.element.querySelector('.js-ai-log')
        this.inputElement = this.element.querySelector('.js-ai-input')
        this.formElement = this.element.querySelector('.js-ai-form')

        this.formElement.addEventListener('submit', (event) =>
        {
            event.preventDefault()
            this.submit()
        })

        this.addMessage('assistant', 'Hi! I\'m Prakash\'s AI guide. Ask me anything about his experience, projects or skills 🙂')
    }

    open()
    {
        this.game.modals.open('ai-guide')
        this.game.analytics?.send('ai_chat_open')
        setTimeout(() => this.inputElement?.focus(), 300)
    }

    addMessage(role, content, record = true)
    {
        if(record)
            this.messages.push({ role, content })

        const item = document.createElement('div')
        item.classList.add('message', role === 'user' ? 'is-user' : 'is-assistant')
        item.textContent = content
        this.logElement.appendChild(item)
        this.logElement.scrollTop = this.logElement.scrollHeight

        return item
    }

    async submit()
    {
        const text = this.inputElement.value.trim()
        if(!text || this.busy || !this.endpoint)
            return

        this.inputElement.value = ''
        this.addMessage('user', text)
        const payload = this.messages.slice(-8)

        this.busy = true
        const pending = this.addMessage('assistant', '…', false)

        try
        {
            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: payload }),
            })
            const data = await response.json()
            pending.textContent = data.reply ?? 'Sorry, something went wrong — try again?'
            this.messages.push({ role: 'assistant', content: pending.textContent })
        }
        catch(_)
        {
            pending.textContent = 'Connection hiccup — please try again, or email prakashkantamani90@gmail.com'
        }

        this.busy = false
        this.logElement.scrollTop = this.logElement.scrollHeight
    }
}

const text = `
██████╗ ██████╗  █████╗ ██╗  ██╗ █████╗ ███████╗██╗  ██╗
██╔══██╗██╔══██╗██╔══██╗██║ ██╔╝██╔══██╗██╔════╝██║  ██║
██████╔╝██████╔╝███████║█████╔╝ ███████║███████╗███████║
██╔═══╝ ██╔══██╗██╔══██║██╔═██╗ ██╔══██║╚════██║██╔══██║
██║     ██║  ██║██║  ██║██║  ██╗██║  ██║███████║██║  ██║
╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝

╔═ Hello there ═════════╗
║ Glad you opened the console — that means you build things too.
║ Here is the stack behind this 3D world and who deserves the credit.
╚═══════════════════════╝

╔═ Reach me ════════════╗
║ Mail     ⇒ prakashkantamani90@gmail.com
║ GitHub   ⇒ https://github.com/kantamaniprakash
║ LinkedIn ⇒ https://linkedin.com/in/prakash-kantamani
║ Website  ⇒ https://kantamaniprakash.github.io
╚═══════════════════════╝

╔═ Credit where due ════╗
║ Built on an MIT-licensed open-source engine — see license.md in the repo.
║ Music by Kounine (CC0) ⇒ https://linktr.ee/Kounine
╚═══════════════════════╝

╔═ Stack ═══════════════╗
║ Three.js (WebGPU/TSL) ⇒ https://threejs.org/
║ Rapier physics        ⇒ https://rapier.rs/
║ Howler.js audio       ⇒ https://howlerjs.com/
╚═══════════════════════╝

╔═ Debug ═══════════════╗
║ Add #debug to the URL and reload. Press [V] for free camera.
╚═══════════════════════╝
`
let finalText = ''
let finalStyles = []
const stylesSet = {
    letter: 'color: #ffffff; font: 400 1em monospace;',
    pipe: 'color: #D66FFF; font: 400 1em monospace;',
}
let currentStyle = null
for(let i = 0; i < text.length; i++)
{
    const char = text[i]

    const style = char.match(/[╔║═╗╚╝╔╝]/) ? 'pipe' : 'letter'
    if(style !== currentStyle)
    {
        currentStyle = style
        finalText += '%c'

        finalStyles.push(stylesSet[currentStyle])
    }
    finalText += char
}

export default [finalText, ...finalStyles]
